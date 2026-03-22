# Makefile for VidInsight Docker Operations
# ==========================================

# Optional: specify a single service, e.g. make build SERVICE=backend
SERVICE ?=

SEPARATOR := ────────────────────────────────────────────────────────────────────────────────

.PHONY: help build up down restart deploy logs status clean

# Default target
.DEFAULT_GOAL := help

help: ## Show this help message
	@echo "VidInsight Docker Commands"
	@echo "========================="
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Examples:"
	@echo "  make build              - Build all Docker images"
	@echo "  make build SERVICE=backend - Build a single service"
	@echo "  make deploy             - Rebuild and start all services"
	@echo "  make status             - Check service health"
	@echo "  make logs               - Follow service logs"
	@echo "  make clean              - Remove containers, volumes, and images"
	@echo ""

build: ## Build Docker images
	@echo "🔨 Building Docker images..."
	@docker compose build $(SERVICE)
	@echo "✅ Build complete!"

up: ## Start services in detached mode
	@echo "🚀 Starting services..."
	@docker compose up -d --wait $(SERVICE)
	@echo "✅ Services are up!"

down: ## Stop services
	@echo "⏹️  Stopping services..."
ifdef SERVICE
	@docker compose stop $(SERVICE)
	@docker compose rm -f $(SERVICE)
else
	@docker compose down
endif
	@echo "✅ Services stopped."

restart: ## Restart services
	@echo "🔄 Restarting services..."
ifdef SERVICE
	@docker compose restart $(SERVICE)
else
	@docker compose down
	@docker compose up -d --wait
endif
	@echo "✅ Services restarted!"

deploy: ## Rebuild and start all services
	@echo "🚀 Deploying VidInsight..."
	@echo ""
	@echo "Step 1: Building images..."
	@docker compose build $(SERVICE)
	@echo ""
	@echo "Step 2: Starting services..."
	@docker compose up -d --wait $(SERVICE)
	@echo ""
	@echo "Step 3: Running database migrations..."
	@docker compose exec -T backend uv run alembic upgrade head
	@echo ""
	@echo "✅ Deployment complete!"
	@echo ""
	@echo "Run 'make status' to check service health"
	@echo "Run 'make logs' to view service logs"

logs: ## View service logs (follow mode)
	@echo "📋 Following service logs..."
	@echo "   (Press Ctrl+C to stop)"
	@echo ""
	@trap '' INT; docker compose logs -f $(SERVICE); true

status: ## Check service health and status
	@echo ""
	@echo "  📦 容器运行状态:"
	@echo "  $(SEPARATOR)"
	@docker compose ps -a --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || echo "  No services found"
	@echo ""
	@echo ""
	@echo "  🏥 健康检查状态:"
	@echo "  $(SEPARATOR)"
	@running_svcs=$$(docker compose ps -a --format '{{.Service}}' 2>/dev/null); \
	all_svcs=$$(docker compose config --services 2>/dev/null); \
	for svc in $$all_svcs; do \
		if echo "$$running_svcs" | grep -qx "$$svc"; then \
			status=$$(docker compose ps -a --format '{{.Service}}|||{{.Status}}' 2>/dev/null | grep "^$$svc|||" | head -1 | cut -d'|' -f4-); \
			health="无健康检查"; \
			running="❌"; \
			run_text="已停止"; \
			if echo "$$status" | grep -qi "up"; then \
				running="✅"; \
				run_text="运行中"; \
			fi; \
			if echo "$$status" | grep -qi "healthy"; then \
				health="健康"; \
			elif echo "$$status" | grep -qi "unhealthy"; then \
				health="不健康"; \
			elif echo "$$status" | grep -qi "health"; then \
				health="启动中"; \
			fi; \
			printf '  %s %-18s %-10s %s\n' "$$running" "$$svc" "$$run_text" "$$health"; \
		else \
			printf '  %s %-18s %-10s %s\n' "❌" "$$svc" "未启动" "不健康"; \
		fi; \
	done
	@echo ""
	@echo ""
	@echo "  📌 常用命令:"
	@echo "  $(SEPARATOR)"
	@echo "  make build      构建镜像          make status    查看状态"
	@echo "  make up         启动服务          make logs      查看日志"
	@echo "  make down       停止所有服务      make clean     清理资源"
	@echo "  make restart    重启服务          make deploy    构建并启动"
	@echo ""
	@echo "  💡 支持 SERVICE=xxx 指定单个服务, 例: make logs SERVICE=frontend"
	@echo ""

clean: ## Stop services and remove volumes and local images
	@echo "🧹 Cleaning up VidInsight resources..."
	@docker compose down -v --rmi local
	@echo "✅ Cleanup complete!"
