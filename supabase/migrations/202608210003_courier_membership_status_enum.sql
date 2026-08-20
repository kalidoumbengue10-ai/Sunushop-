begin;

-- Postgres interdit d'utiliser une valeur d'enum ajoutée dans la même
-- transaction que celle qui l'a créée. Ce fichier ne fait donc que l'ajouter ;
-- la migration qui la référence est numérotée après
-- (202608210004_courier_membership_simplification.sql).
--
-- 'pending_invitation' : le commerçant a sollicité un livreur déjà inscrit sur
-- la plateforme, qui n'a pas encore accepté de rejoindre son équipe.
alter type public.courier_membership_status add value if not exists 'pending_invitation' before 'active';

commit;
