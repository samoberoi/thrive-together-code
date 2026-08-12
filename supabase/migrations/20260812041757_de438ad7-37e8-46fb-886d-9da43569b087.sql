insert into public.app_settings (key, value)
values ('notification_sound', '{"enabled": true, "variant": "hummingbird", "volume": 1}'::jsonb)
on conflict (key) do update set value = excluded.value;