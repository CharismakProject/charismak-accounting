create or replace function private.is_statement_candidate_stopword(token text)
returns boolean
language sql
immutable
set search_path=''
as $$
  select upper(coalesce(token,'')) = any(array[
    'OPAY','MONIE','MONIEPOINT','PALMPAY','KUDA','CARBON','POINT','BANK','MOBILE','MFB','MICROFINANCE','WALLET','PLC',
    'PAY','PAYMENT','TRANSACTION','TRANS','TRANSFER','MTN','VAT','POS','ATM','UBA','GTB','GTBANK','ZENITH','ACCESS','FIRSTBANK',
    'FIDELITY','FCMB','STERLING','WEMA','POLARIS','ECOBANK','STANBIC','IBTC','NIP','NIBSS','NEFT','RTGS','SWIFT','NGN','NAIRA',
    'SAL','IOU','CPNL','CHARISMAK','CARD','DATA','REFUND','OWEALTH','SITE','CONSTRUCTION','FUND','FUNDS','BOQ','TABLE','CHARGE',
    'CHARGES','FEE','FEES','LEVY','STAMP','DUTY','SMS','ALERT','MAINT','MAINTENANCE','ACCOUNT','ACCT','CREDIT','DEBIT','WITHDRAWAL',
    'DEPOSIT','CASH','ONLINE','WEB','USSD','TOKEN','REVERSAL','REVERS','INTEREST','COMMISSION','TAX','WHT','EMTL','REMARK','NARRATION',
    'DESCRIPTION','REFERENCE','BALANCE','AVAILABLE','OPENING','CLOSING','DATE','VALUE','CHQ','IFO','NO','BTW','AND','FROM','WITH','FOR',
    'THE','LTD','LIMITED','NIG','NIGERIA','INTERNATIONAL','JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'
  ]::text[])
$$;
comment on function private.is_statement_candidate_stopword(text) is 'Shared bank/payment vocabulary filter for statement project discovery.';
