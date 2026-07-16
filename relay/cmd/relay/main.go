// Command relay is the StreamMix WebSocket fan-out server.
//
// Usage:
//   relay --config config.yaml
//   relay token --channel twitch:foo --ttl 8760h
//   relay secret               # print a new random HMAC secret to stdout
package main

import (
	"context"
	"encoding/base64"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/streammix/streammix/relay/internal"
)

func main() {
	if len(os.Args) >= 2 {
		switch os.Args[1] {
		case "token":
			os.Exit(runToken(os.Args[2:]))
		case "secret":
			os.Exit(runSecret())
		}
	}
	os.Exit(runServe(os.Args[1:]))
}

func runSecret() int {
	b, err := internal.NewSecret()
	if err != nil {
		fmt.Fprintln(os.Stderr, "generating secret:", err)
		return 1
	}
	fmt.Println(base64.RawURLEncoding.EncodeToString(b))
	return 0
}

func runToken(args []string) int {
	fs := flag.NewFlagSet("token", flag.ContinueOnError)
	channel := fs.String("channel", "", "channel id, e.g. twitch:streamer")
	ttl := fs.Duration("ttl", 365*24*time.Hour, "token lifetime")
	configPath := fs.String("config", "config.yaml", "config file path (for secret)")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *channel == "" {
		fmt.Fprintln(os.Stderr, "--channel required")
		return 2
	}
	cfg, err := internal.LoadConfig(*configPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "config:", err)
		return 1
	}
	secret, err := base64.RawURLEncoding.DecodeString(cfg.Auth.TokenSecret)
	if err != nil {
		fmt.Fprintln(os.Stderr, "secret decode:", err)
		return 1
	}
	tok, err := internal.MintToken(secret, *channel, *ttl)
	if err != nil {
		fmt.Fprintln(os.Stderr, "mint:", err)
		return 1
	}
	fmt.Println(tok)
	return 0
}

func runServe(args []string) int {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	configPath := fs.String("config", "config.yaml", "config file path")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	cfg, err := internal.LoadConfig(*configPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "config:", err)
		return 1
	}

	secret, err := base64.RawURLEncoding.DecodeString(cfg.Auth.TokenSecret)
	if err != nil || len(secret) < 16 {
		fmt.Fprintln(os.Stderr, "auth.token_secret must be a base64url-encoded value of at least 16 bytes")
		return 1
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))

	reg := internal.NewRegistry(
		cfg.Limits.MaxChannels,
		cfg.Limits.MaxSubscribersPerChannel,
		cfg.Limits.SubscriberSendBuffer,
	)
	srv := internal.New(cfg, reg, secret, logger)

	mux := http.NewServeMux()
	srv.Routes(mux)

	httpSrv := &http.Server{
		Addr:              cfg.Listen,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// Optional metrics endpoint on its own listener.
	if cfg.Metrics.Enabled {
		go runMetrics(srv, cfg.Metrics.Listen, logger)
	}

	// Background reaper: clean up idle channels every minute.
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	go reaperLoop(ctx, reg, time.Minute)

	go func() {
		var err error
		if cfg.TLS.Cert != "" {
			logger.Info("listening (TLS)", "addr", cfg.Listen)
			err = httpSrv.ListenAndServeTLS(cfg.TLS.Cert, cfg.TLS.Key)
		} else {
			logger.Info("listening (plain http — dev only)", "addr", cfg.Listen)
			err = httpSrv.ListenAndServe()
		}
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server stopped", "err", err)
			cancel()
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	_ = httpSrv.Shutdown(shutdownCtx)
	return 0
}

func runMetrics(srv *internal.Server, addr string, logger *slog.Logger) {
	mux := http.NewServeMux()
	mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		srv.WriteMetrics(w)
	})
	logger.Info("metrics listening", "addr", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		logger.Warn("metrics server stopped", "err", err)
	}
}

func reaperLoop(ctx context.Context, reg *internal.Registry, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			reg.Reap()
		}
	}
}
