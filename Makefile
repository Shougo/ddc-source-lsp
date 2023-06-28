test:
	deno test -A **/*_test.ts

lint:
	deno lint
	luacheck lua/*

fmt:
	deno fmt
	stylua lua/*

.PHONY: test lint fmt
