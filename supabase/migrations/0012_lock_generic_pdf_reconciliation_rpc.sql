-- The reconciliation routine is an internal automatic trigger helper, not an end-user RPC.
revoke execute on function public.reconcile_generic_pdf_statement(uuid) from public;
revoke execute on function public.reconcile_generic_pdf_statement(uuid) from anon;
revoke execute on function public.reconcile_generic_pdf_statement(uuid) from authenticated;
