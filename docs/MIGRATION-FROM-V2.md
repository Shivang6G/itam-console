# Moving data from v2 (Supabase)

v2 data is test/demo data in most cases. If you need to keep it:

1. **Assets, tickets, licenses**: export each table to CSV from Supabase, then load into RDS with `psql \copy` after the first deploy.
   Column mapping: v2 `assets.serial` -> `serial`; v2 status `available` -> `in_stock`, `lost` -> `retired` (add a note); `assigned_to` and `warranty_expiry` -> `warranty_end`; licenses `name` -> `product`, `expiry` -> `expires_on`.
   Reach RDS through a one-off ECS task or a temporary bastion; the database has no public endpoint by design.
2. **Users**: passwords cannot be exported. Create each person with `scripts/create-user.sh`; they set a new password at first sign-in.
3. **Attachments**: v2 had none.
4. Decommission the Supabase project and the old EC2/Terraform stack (`terraform destroy` there) after verifying v3.
