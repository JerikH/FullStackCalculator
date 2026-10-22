package app

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"
)

const healthcheckTimeout = 2 * time.Second

// Probe checks /healthz on the instance listening at addr.
func Probe(ctx context.Context, addr string, client *http.Client) error {
	target, err := probeTarget(addr)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+target+"/healthz", http.NoBody)
	if err != nil {
		return fmt.Errorf("healthcheck: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("healthcheck: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("healthcheck: unexpected status %d", resp.StatusCode)
	}
	return nil
}

// probeTarget maps a listen address to a dialable one: wildcard hosts are
// reached through loopback.
func probeTarget(addr string) (string, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return "", fmt.Errorf("healthcheck: invalid address %q: %w", addr, err)
	}
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	return net.JoinHostPort(host, port), nil
}
