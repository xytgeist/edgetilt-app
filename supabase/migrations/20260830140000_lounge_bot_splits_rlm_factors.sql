-- Seed Betting Splits and Reverse Line Movement (RLM) factors into persona weights table

do $$
begin
  insert into public.lounge_bot_persona_weights (picker_name, factor_key, prior_weight, calibrated_weight)
  values
    ('Chedda', 'reverse_line_movement', 1.0, 1.0),
    ('Chedda', 'sharp_money_divergence', 1.0, 1.0),
    ('Rocco', 'reverse_line_movement', 1.0, 1.0),
    ('Rocco', 'sharp_money_divergence', 1.0, 1.0),
    ('Scott', 'reverse_line_movement', 1.0, 1.0),
    ('Scott', 'sharp_money_divergence', 1.0, 1.0)
  on conflict (picker_name, factor_key) do nothing;
end $$;
