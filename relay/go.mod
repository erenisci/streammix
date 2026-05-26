module github.com/streammix/streammix/relay

go 1.22

require (
	github.com/coder/websocket v1.8.12
	github.com/streammix/streammix/shared/go v0.0.0
	gopkg.in/yaml.v3 v3.0.1
)

replace github.com/streammix/streammix/shared/go => ../shared/go
