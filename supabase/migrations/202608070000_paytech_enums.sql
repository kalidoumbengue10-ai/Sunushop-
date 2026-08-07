begin;

-- Postgres interdit d'utiliser une valeur d'enum ajoutée dans la même
-- transaction que celle qui l'a créée. Ce fichier ne fait donc que les
-- ajouter ; toute migration qui les référence doit être numérotée après
-- celui-ci (202608070001_paytech_escrow.sql et suivantes).
alter type public.payment_channel add value if not exists 'paytech';
alter type public.order_payment_method add value if not exists 'paytech';

commit;
