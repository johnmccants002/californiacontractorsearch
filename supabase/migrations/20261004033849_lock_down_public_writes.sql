-- Keep the public Data API read-only for contractor lookup data.
revoke insert, update, delete, truncate, references, trigger on table
  public.licenses,
  public.classifications,
  public.license_classifications,
  public.personnel,
  public.bonds,
  public.workers_comp
from anon, authenticated;

revoke all on all sequences in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
