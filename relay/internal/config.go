package internal

import (
	"errors"
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Config is the on-disk configuration.
type Config struct {
	Listen string `yaml:"listen"`
	TLS    struct {
		Cert string `yaml:"cert"`
		Key  string `yaml:"key"`
	} `yaml:"tls"`
	Limits struct {
		MaxChannels             int `yaml:"max_channels"`
		MaxSubscribersPerChannel int `yaml:"max_subscribers_per_channel"`
		MaxFrameBytes           int `yaml:"max_frame_bytes"`
		SubscriberSendBuffer    int `yaml:"subscriber_send_buffer"`
	} `yaml:"limits"`
	Auth struct {
		// TokenSecret is the HMAC secret. Required.
		TokenSecret string `yaml:"token_secret"`
	} `yaml:"auth"`
	Metrics struct {
		Enabled bool   `yaml:"enabled"`
		Listen  string `yaml:"listen"`
	} `yaml:"metrics"`
}

// Defaults applies safe defaults for any zero-valued field.
func (c *Config) Defaults() {
	if c.Listen == "" {
		c.Listen = ":8080"
	}
	if c.Limits.MaxChannels == 0 {
		c.Limits.MaxChannels = 1000
	}
	if c.Limits.MaxSubscribersPerChannel == 0 {
		c.Limits.MaxSubscribersPerChannel = 5000
	}
	if c.Limits.MaxFrameBytes == 0 {
		// 21-byte header + 4 KiB payload + slack
		c.Limits.MaxFrameBytes = 5 * 1024
	}
	if c.Limits.SubscriberSendBuffer == 0 {
		c.Limits.SubscriberSendBuffer = 64
	}
	if c.Metrics.Listen == "" {
		c.Metrics.Listen = ":9090"
	}
}

// Validate returns an error if the config is unusable.
func (c *Config) Validate() error {
	if c.Auth.TokenSecret == "" {
		return errors.New("auth.token_secret is required")
	}
	if (c.TLS.Cert == "") != (c.TLS.Key == "") {
		return errors.New("tls.cert and tls.key must both be set or both empty")
	}
	return nil
}

// LoadConfig reads YAML from path, applies defaults, validates.
func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	var c Config
	if err := yaml.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	c.Defaults()
	if err := c.Validate(); err != nil {
		return nil, err
	}
	return &c, nil
}
