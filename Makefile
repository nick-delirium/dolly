.PHONY: help deps build test install uninstall

help: ## Prints help for targets with comments
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-25s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

deps: ## Install npm dependencies (including tsc)
	npm install

build: deps ## Compile TypeScript to dist/
	npm run build

test: ## Build and run the test suite
	npm test

##@ Install

install: build ## Build, register the `dolly` binary globally, and wire it into this repo
	npm install -g .
	dolly install

uninstall: ## Remove the globally installed `dolly` binary
	npm uninstall -g dolly
