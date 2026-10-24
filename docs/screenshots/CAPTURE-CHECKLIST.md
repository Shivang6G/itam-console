# Screenshot checklist

Save PNGs in this folder with these names. Only link a screenshot in the README after the file exists.

Local (15 minutes, no AWS):
- 01-signin.png: http://localhost:8080 sign-in page
- 02-dashboard.png: dashboard with seeded data
- 03-assets.png: assets list, then add one asset
- 04-asset-detail-audit.png: audit log page (admin) showing the change
- 05-tickets.png: tickets page
- 06-tests-passing.png: terminal showing `npm test` all 43 passing (run with DB running)

After AWS deploy (use the real CloudFront URL, hide the account ID if you want):
- 10-live-app-cloudfront.png: app on the cloudfront.net URL
- 11-ecs-service.png: ECS service with running tasks
- 12-alb-target-healthy.png: target group showing healthy
- 13-rds.png: RDS instance available
- 14-cloudwatch-dashboard.png: dashboard itam-demo
- 15-s3-attachment.png: uploaded PDF in the bucket or on the asset page
- 16-terraform-apply.png: apply complete
Never show access keys, passwords or the temporary Cognito password.
