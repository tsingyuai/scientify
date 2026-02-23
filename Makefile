# Scientify Plugin Development Makefile
# 改进版 - Gateway 解耦设计

.PHONY: help dev build test clean \
        gateway gateway-bg gateway-stop gateway-status gateway-check \
        logs debug reload test-tool \
        quickstart link unlink status enable disable toggle

# ============================================================================
# 核心开发命令（推荐日常使用）
# ============================================================================

help:
	@echo "Scientify Plugin Development (Improved)"
	@echo ""
	@echo "📍 推荐工作流："
	@echo "  1. 启动 Gateway（一次）: openclaw gateway &"
	@echo "  2. 开发插件（每次）:     make dev"
	@echo ""
	@echo "🔧 核心命令："
	@echo "  make dev           - 启动插件热重载（推荐）⭐"
	@echo "  make build         - 构建插件"
	@echo "  make test          - 测试插件工具"
	@echo "  make clean         - 清理构建产物"
	@echo ""
	@echo "🚀 Gateway 管理（可选）："
	@echo "  make gateway       - 启动 Gateway（前台，详细日志）"
	@echo "  make gateway-bg    - 启动 Gateway（后台）"
	@echo "  make gateway-stop  - 停止 Gateway"
	@echo "  make gateway-status - 检查 Gateway 状态"
	@echo ""
	@echo "🐛 调试工具："
	@echo "  make logs          - 查看 Gateway 日志"
	@echo "  make debug         - 调试模式（Gateway 前台 + 热重载）"
	@echo "  make reload        - 重载插件（不重启 Gateway）"
	@echo "  make test-tool TOOL=arxiv_search - 测试单个工具"
	@echo ""
	@echo "⚡ 快速启动（新手）："
	@echo "  make quickstart    - 智能启动（检测 Gateway + 热重载）"
	@echo ""
	@echo "🔗 插件管理："
	@echo "  make link          - 链接插件到 OpenClaw"
	@echo "  make unlink        - 卸载插件"
	@echo "  make enable        - 启用插件（可插拔）"
	@echo "  make disable       - 禁用插件（可插拔）"
	@echo "  make toggle        - 切换插件状态"
	@echo "  make status        - 查看插件状态"

# ============================================================================
# 核心开发命令
# ============================================================================

# 仅启动热重载（推荐）⭐
dev:
	@echo "🔥 Starting plugin hot reload..."
	@echo ""
	@if ! $(MAKE) -s gateway-check; then \
		echo "⚠️  Gateway not running!"; \
		echo ""; \
		echo "Please start Gateway first:"; \
		echo "  Option 1: openclaw gateway &"; \
		echo "  Option 2: make gateway-bg"; \
		echo "  Option 3: make quickstart  (auto-start)"; \
		echo ""; \
		exit 1; \
	fi
	@echo "✅ Gateway detected"
	@echo "✅ Starting TypeScript watch mode..."
	@echo "📝 Edit src/ files, changes will auto-reload"
	@echo ""
	@pnpm dev

# 构建插件
build:
	@echo "🔨 Building plugin..."
	@pnpm build
	@echo "✅ Build complete"

# 测试插件
test:
	@echo "🧪 Testing scientify plugin..."
	@echo ""
	@echo "=== Testing ArxivSearch tool ==="
	@openclaw agent --local \
		--message "Search arXiv for 'transformer neural networks' papers from 2024" \
		--session-id test-$$(date +%s) 2>&1 | head -50
	@echo ""
	@echo "=== Testing OpenAlexSearch tool ==="
	@openclaw agent --local \
		--message "Search OpenAlex for 'deep learning' papers" \
		--session-id test-$$(date +%s) 2>&1 | head -50

# 清理构建产物
clean:
	@echo "🧹 Cleaning build artifacts..."
	@rm -rf dist
	@echo "✅ Clean complete"

# ============================================================================
# Gateway 管理（可选）
# ============================================================================

# 检查 Gateway 是否运行（内部使用）
gateway-check:
	@openclaw gateway status > /dev/null 2>&1

# 启动 Gateway（前台，详细日志）
gateway:
	@if pgrep -f openclaw-gateway > /dev/null; then \
		echo "🛑 Stopping existing Gateway..."; \
		pkill -TERM -f openclaw-gateway; \
		sleep 1; \
	fi
	@echo "🚀 Starting Gateway in foreground (verbose mode)..."
	@echo "Press Ctrl+C to stop"
	@echo ""
	@openclaw gateway --verbose

# 启动 Gateway（后台）
gateway-bg:
	@if pgrep -f openclaw-gateway > /dev/null; then \
		echo "🛑 Stopping existing Gateway..."; \
		pkill -TERM -f openclaw-gateway; \
		sleep 1; \
	fi
	@echo "🚀 Starting Gateway in background..."
	@nohup openclaw gateway > /tmp/openclaw-dev.log 2>&1 &
	@sleep 2
	@if $(MAKE) -s gateway-check; then \
		echo "✅ Gateway started (PID: $$(pgrep -f openclaw-gateway))"; \
		echo "📝 Logs: /tmp/openclaw-dev.log"; \
	else \
		echo "❌ Gateway failed to start"; \
		echo "Check logs: tail -f /tmp/openclaw-dev.log"; \
		exit 1; \
	fi

# 停止 Gateway
gateway-stop:
	@echo "🛑 Stopping Gateway..."
	@if pgrep -f openclaw-gateway > /dev/null; then \
		pkill -TERM -f openclaw-gateway && \
		echo "✅ Gateway stopped"; \
	else \
		echo "ℹ️  Gateway not running"; \
	fi

# Gateway 状态
gateway-status:
	@echo "=== Gateway Status ==="
	@openclaw gateway status 2>&1 | grep -v DEP0040 || echo "Gateway not running"

# ============================================================================
# 调试工具
# ============================================================================

# 查看实时日志
logs:
	@echo "📋 Watching Gateway logs (Ctrl+C to stop)..."
	@echo ""
	@if [ -f /tmp/openclaw/openclaw-$$(date +%Y-%m-%d).log ]; then \
		tail -f /tmp/openclaw/openclaw-$$(date +%Y-%m-%d).log; \
	elif [ -f /tmp/openclaw-dev.log ]; then \
		tail -f /tmp/openclaw-dev.log; \
	else \
		echo "❌ No log file found"; \
		echo "Logs may be at:"; \
		echo "  - /tmp/openclaw/openclaw-*.log"; \
		echo "  - /tmp/openclaw-dev.log"; \
		ls -la /tmp/openclaw/*.log 2>/dev/null || true; \
	fi

# 调试模式（Gateway 前台 + 热重载）
debug:
	@if pgrep -f openclaw-gateway > /dev/null; then \
		echo "🛑 Stopping existing Gateway..."; \
		pkill -TERM -f openclaw-gateway; \
		sleep 1; \
	fi
	@echo "🐛 Starting debug mode..."
	@echo "Gateway + Plugin hot reload (Ctrl+C to stop)"
	@echo ""
	@trap 'kill 0' EXIT; \
	(openclaw gateway --verbose) & \
	(sleep 3 && pnpm dev) & \
	wait

# 重载插件（不重启 Gateway）
reload:
	@echo "🔄 Reloading plugin..."
	@pnpm build
	@echo "✅ Plugin rebuilt"
	@echo "ℹ️  Gateway will auto-detect changes"
	@sleep 1
	@$(MAKE) -s status | grep scientify || echo "⚠️  Plugin may not be loaded"

# 测试单个工具
test-tool:
	@if [ -z "$(TOOL)" ]; then \
		echo "❌ Please specify TOOL parameter"; \
		echo "Example: make test-tool TOOL=arxiv_search"; \
		exit 1; \
	fi
	@echo "🧪 Testing tool: $(TOOL)"
	@echo ""
	@openclaw agent --local \
		--message "Use the $(TOOL) tool to search for 'test'" \
		--session-id debug-$$(date +%s)

# ============================================================================
# 快速启动（新手友好）
# ============================================================================

# 智能启动（自动检测 Gateway）
quickstart:
	@echo "⚡ Quick Start..."
	@echo ""
	@if $(MAKE) -s gateway-check; then \
		echo "✅ Gateway already running"; \
	else \
		echo "🚀 Gateway not found, starting..."; \
		$(MAKE) gateway-bg; \
	fi
	@echo ""
	@echo "🔥 Starting hot reload..."
	@pnpm dev

# ============================================================================
# 插件管理
# ============================================================================

# 链接插件
link:
	@echo "🔗 Linking scientify plugin to OpenClaw..."
	@openclaw plugins install --link .
	@echo "✅ Plugin linked"
	@echo ""
	@$(MAKE) -s status

# 卸载插件
unlink:
	@echo "🔓 Unlinking scientify plugin..."
	@openclaw plugins uninstall scientify
	@echo "✅ Plugin unlinked"

# 查看状态
status:
	@echo "=== Plugin Status ==="
	@openclaw plugins list 2>&1 | grep -A 2 "scientify" || echo "Plugin not loaded"
	@echo ""
	@echo "=== Gateway Status ==="
	@if $(MAKE) -s gateway-check; then \
		openclaw gateway status 2>&1 | head -10; \
	else \
		echo "Gateway not running"; \
	fi

# ============================================================================
# 可插拔插件管理（启用/禁用）
# ============================================================================

# 启用插件
enable:
	@echo "🔌 Enabling scientify plugin..."
	@if ! grep -q "/Users/springleaf/study/collaborator/scientify" ~/.openclaw/openclaw.json 2>/dev/null; then \
		jq '.plugins.load.paths += ["/Users/springleaf/study/collaborator/scientify"]' ~/.openclaw/openclaw.json > ~/.openclaw/openclaw.json.tmp && \
		mv ~/.openclaw/openclaw.json.tmp ~/.openclaw/openclaw.json && \
		echo "✅ Plugin path added to config"; \
	else \
		echo "ℹ️  Plugin path already in config"; \
	fi
	@openclaw plugins install --link . > /dev/null 2>&1 || true
	@echo "✅ Plugin enabled"
	@echo ""
	@echo "⚠️  Note: Restart Gateway to load plugin:"
	@echo "  make gateway-stop && make gateway-bg"
	@echo ""
	@$(MAKE) -s status

# 禁用插件
disable:
	@echo "🔌 Disabling scientify plugin..."
	@jq '.plugins.load.paths = (.plugins.load.paths // [] | map(select(. != "/Users/springleaf/study/collaborator/scientify")))' ~/.openclaw/openclaw.json > ~/.openclaw/openclaw.json.tmp && \
	mv ~/.openclaw/openclaw.json.tmp ~/.openclaw/openclaw.json
	@jq 'del(.plugins.entries.scientify) | del(.plugins.installs.scientify)' ~/.openclaw/openclaw.json > ~/.openclaw/openclaw.json.tmp && \
	mv ~/.openclaw/openclaw.json.tmp ~/.openclaw/openclaw.json
	@echo "✅ Plugin disabled"
	@echo ""
	@echo "⚠️  Note: Restart Gateway to unload plugin:"
	@echo "  make gateway-stop && make gateway-bg"
	@echo ""
	@$(MAKE) -s status

# 切换插件状态
toggle:
	@if grep -q "/Users/springleaf/study/collaborator/scientify" ~/.openclaw/openclaw.json 2>/dev/null; then \
		echo "Plugin is enabled, disabling..."; \
		$(MAKE) disable; \
	else \
		echo "Plugin is disabled, enabling..."; \
		$(MAKE) enable; \
	fi
