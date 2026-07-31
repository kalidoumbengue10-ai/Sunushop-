export function SetupRequired() {
  return (
    <div className="mvp-alert mvp-alert--warning">
      <strong>Supabase n’est pas encore connecté.</strong>
      <br />
      Renseignez les variables de <code>.env.local</code>, appliquez les
      migrations et configurez l’authentification email pour activer ce
      parcours.
    </div>
  );
}
