CREATE OR REPLACE FUNCTION public.thyrocare_orders_payment_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if new.status in ('created','awaiting_payment') and new.payment_status <> 'paid' then
    perform public.svc_request_payment_link('lab', new.id);
  end if;
  return new;
end;
$$;