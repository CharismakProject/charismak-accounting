begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_table('public','chart_of_accounts','Chart of accounts exists');
select has_table('public','journal_entries','Journal entries exist');
select has_table('public','journal_lines','Journal lines exist');
select has_table('public','canonical_journal_links','Canonical-to-journal links exist');

select has_function('public','create_company_workspace',array['text','text']::name[],'Self-service company onboarding RPC exists');
select has_function('public','decide_approval_request_atomic',array['uuid','text','numeric','text']::name[],'Atomic approval RPC exists');
select has_function('public','record_internal_transfer_atomic',array['uuid','date','numeric','uuid','uuid','uuid','uuid','text']::name[],'Atomic internal transfer RPC exists');
select has_function('public','confirm_statement_transaction_atomic',array['uuid','uuid','text','uuid','text']::name[],'Atomic statement confirmation RPC exists');
select has_function('public','post_journal_entry',array['uuid']::name[],'Journal posting RPC exists');

select col_has_check('public','approval_requests','amount','Approval request amount is constrained');
select col_has_check('public','approval_requests','approved_amount','Approved amount is constrained');
select col_has_check('public','approval_requests','paid_amount','Paid amount is constrained');
select col_has_check('public','membership_permission_overrides','approval_limit','Delegated approval limit is constrained');
select col_has_check('public','membership_permission_overrides','payment_limit','Delegated payment limit is constrained');
select col_has_check('public','transfer_pairs','amount','Transfer amount is constrained');
select col_has_check('public','project_progress_updates','cost_to_complete_override','Cost to complete is constrained');
select has_check('public','journal_lines','Journal lines enforce debit/credit shape');
select col_is_unique('public','chart_of_accounts',array['company_id','code']::name[],'Chart codes are unique within a company');

select * from finish();
rollback;
