.PHONY: help dev test build tf-fmt first-demo deploy-demo deploy-prod
help:
	@echo "make dev | test | build | tf-fmt | first-demo | deploy-demo | deploy-prod"
dev:
	cd app && npm ci && npm run dev
test:
	cd app && npm run lint && npm run typecheck && npm test
build:
	cd app && npm run build
tf-fmt:
	terraform fmt -recursive infra
first-demo:
	scripts/first-deploy.sh demo
deploy-demo:
	scripts/deploy.sh demo
deploy-prod:
	scripts/deploy.sh prod
