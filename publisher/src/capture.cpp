#include "capture.h"

#include <windows.h>

#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <mmreg.h>
#include <ksmedia.h>
#include <tlhelp32.h>
#include <wrl/client.h>
#include <wrl/implements.h>

#include <chrono>
#include <cstring>
#include <cstdio>
#include <cwctype>
#include <mutex>
#include <string>
#include <vector>

// Windows process-loopback capture requires the IActivateAudioInterfaceCompletionHandler
// pattern from ActivateAudioInterfaceAsync. This file implements it.

using Microsoft::WRL::ComPtr;

namespace streammix::publisher {

namespace {

constexpr DWORD kBufferDurationMs = 200;

// Look up a process id by exe name. First match wins.
DWORD FindPidByExeName(const std::string& exe_name) {
    if (exe_name.empty()) return 0;
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return 0;
    PROCESSENTRY32W entry{};
    entry.dwSize = sizeof(entry);
    DWORD pid = 0;
    if (Process32FirstW(snap, &entry)) {
        std::wstring want;
        want.reserve(exe_name.size());
        for (char c : exe_name) want.push_back(static_cast<wchar_t>(std::towlower(static_cast<wint_t>(c))));
        do {
            std::wstring cur = entry.szExeFile;
            for (auto& w : cur) w = static_cast<wchar_t>(std::towlower(static_cast<wint_t>(w)));
            if (cur == want) { pid = entry.th32ProcessID; break; }
        } while (Process32NextW(snap, &entry));
    }
    CloseHandle(snap);
    return pid;
}

class ActivationHandler
    : public Microsoft::WRL::RuntimeClass<
          Microsoft::WRL::RuntimeClassFlags<Microsoft::WRL::ClassicCom>,
          Microsoft::WRL::FtmBase,
          IActivateAudioInterfaceCompletionHandler> {
public:
    HANDLE done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    HRESULT result = E_FAIL;
    ComPtr<IAudioClient> client;

    ~ActivationHandler() { if (done) CloseHandle(done); }

    STDMETHODIMP ActivateCompleted(IActivateAudioInterfaceAsyncOperation* op) override {
        HRESULT activate_hr = S_OK;
        ComPtr<IUnknown> unknown;
        HRESULT hr = op->GetActivateResult(&activate_hr, &unknown);
        if (SUCCEEDED(hr)) hr = activate_hr;
        if (SUCCEEDED(hr) && unknown) {
            hr = unknown.As(&client);
        }
        result = hr;
        SetEvent(done);
        return S_OK;
    }
};

}  // namespace

struct ProcessLoopbackCapture::Impl {
    PcmCallback cb;
    CaptureTarget target;
};

ProcessLoopbackCapture::ProcessLoopbackCapture() : impl_(std::make_unique<Impl>()) {}

ProcessLoopbackCapture::~ProcessLoopbackCapture() {
    Stop();
}

std::string ProcessLoopbackCapture::Start(const CaptureTarget& target, PcmCallback cb) {
    if (running_.load()) return "already running";
    impl_->target = target;
    impl_->cb = std::move(cb);
    running_.store(true);

    thread_ = std::thread([this]() {
        HRESULT init_hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        if (FAILED(init_hr) && init_hr != RPC_E_CHANGED_MODE) {
            std::fprintf(stderr, "[capture] CoInitializeEx failed: 0x%08lx\n", init_hr);
            running_.store(false);
            return;
        }

        const auto& tgt = impl_->target;
        ComPtr<IAudioClient> audio_client;

        if (tgt.use_system) {
            ComPtr<IMMDeviceEnumerator> enumerator;
            HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                                          IID_PPV_ARGS(&enumerator));
            ComPtr<IMMDevice> device;
            if (SUCCEEDED(hr)) hr = enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &device);
            if (SUCCEEDED(hr)) hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
                                                    reinterpret_cast<void**>(audio_client.GetAddressOf()));
            if (FAILED(hr)) {
                std::fprintf(stderr, "[capture] system loopback activation failed: 0x%08lx\n", hr);
                running_.store(false);
                CoUninitialize();
                return;
            }
        } else {
            DWORD pid = FindPidByExeName(tgt.process_exe);
            if (pid == 0) {
                std::fprintf(stderr, "[capture] process not found: %s\n", tgt.process_exe.c_str());
                running_.store(false);
                CoUninitialize();
                return;
            }

            AUDIOCLIENT_ACTIVATION_PARAMS params{};
            params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
            params.ProcessLoopbackParams.TargetProcessId = pid;
            params.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;

            PROPVARIANT prop{};
            prop.vt = VT_BLOB;
            prop.blob.cbSize = sizeof(params);
            prop.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

            auto handler = Microsoft::WRL::Make<ActivationHandler>();
            ComPtr<IActivateAudioInterfaceAsyncOperation> op;
            HRESULT hr = ActivateAudioInterfaceAsync(
                VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                __uuidof(IAudioClient),
                &prop,
                handler.Get(),
                &op);
            if (FAILED(hr)) {
                std::fprintf(stderr, "[capture] ActivateAudioInterfaceAsync failed: 0x%08lx\n", hr);
                running_.store(false);
                CoUninitialize();
                return;
            }
            WaitForSingleObject(handler->done, 5000);
            if (FAILED(handler->result) || !handler->client) {
                std::fprintf(stderr, "[capture] activation result failed: 0x%08lx\n", handler->result);
                running_.store(false);
                CoUninitialize();
                return;
            }
            audio_client = handler->client;
        }

        // Process-loopback REQUIRES 16-bit / 48 kHz / stereo PCM per the docs.
        // For system loopback we'd normally call GetMixFormat, but for parity
        // and Opus-friendliness we force the same format below for both paths.
        WAVEFORMATEX wfx{};
        wfx.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
        wfx.nChannels = 2;
        wfx.nSamplesPerSec = 48000;
        wfx.wBitsPerSample = 32;
        wfx.nBlockAlign = wfx.nChannels * wfx.wBitsPerSample / 8;
        wfx.nAvgBytesPerSec = wfx.nSamplesPerSec * wfx.nBlockAlign;
        wfx.cbSize = 0;

        DWORD flags = AUDCLNT_STREAMFLAGS_LOOPBACK |
                      AUDCLNT_STREAMFLAGS_EVENTCALLBACK;
        // For process-loopback this flag is required; harmless for system loopback.
        // (system loopback doesn't actually use the flag but the call still succeeds)
        REFERENCE_TIME buffer_duration_100ns = static_cast<REFERENCE_TIME>(kBufferDurationMs) * 10000;

        HRESULT hr = audio_client->Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            flags,
            buffer_duration_100ns,
            0,
            &wfx,
            nullptr);
        if (FAILED(hr)) {
            std::fprintf(stderr, "[capture] Initialize failed: 0x%08lx (format mismatch?)\n", hr);
            running_.store(false);
            CoUninitialize();
            return;
        }

        HANDLE event = CreateEventW(nullptr, FALSE, FALSE, nullptr);
        hr = audio_client->SetEventHandle(event);
        if (FAILED(hr)) {
            std::fprintf(stderr, "[capture] SetEventHandle failed: 0x%08lx\n", hr);
            running_.store(false);
            CloseHandle(event);
            CoUninitialize();
            return;
        }

        ComPtr<IAudioCaptureClient> capture;
        hr = audio_client->GetService(IID_PPV_ARGS(&capture));
        if (FAILED(hr)) {
            std::fprintf(stderr, "[capture] GetService failed: 0x%08lx\n", hr);
            running_.store(false);
            CloseHandle(event);
            CoUninitialize();
            return;
        }

        hr = audio_client->Start();
        if (FAILED(hr)) {
            std::fprintf(stderr, "[capture] Start failed: 0x%08lx\n", hr);
            running_.store(false);
            CloseHandle(event);
            CoUninitialize();
            return;
        }

        while (running_.load()) {
            DWORD wait = WaitForSingleObject(event, 1000);
            if (wait != WAIT_OBJECT_0) continue;

            BYTE* data = nullptr;
            UINT32 frames = 0;
            DWORD packet_flags = 0;
            UINT64 dev_pos = 0;
            UINT64 qpc = 0;
            while (SUCCEEDED(capture->GetBuffer(&data, &frames, &packet_flags, &dev_pos, &qpc))
                   && frames > 0) {
                PcmFrame f;
                f.sample_rate = wfx.nSamplesPerSec;
                f.channels = wfx.nChannels;
                f.timestamp_100ns = qpc;
                f.samples.resize(static_cast<std::size_t>(frames) * wfx.nChannels);
                if (packet_flags & AUDCLNT_BUFFERFLAGS_SILENT) {
                    std::fill(f.samples.begin(), f.samples.end(), 0.0f);
                } else {
                    std::memcpy(f.samples.data(), data,
                                f.samples.size() * sizeof(float));
                }
                impl_->cb(std::move(f));
                capture->ReleaseBuffer(frames);
            }
        }

        audio_client->Stop();
        CloseHandle(event);
        CoUninitialize();
    });

    return {};
}

void ProcessLoopbackCapture::Stop() {
    running_.store(false);
    if (thread_.joinable()) thread_.join();
}

}  // namespace streammix::publisher
