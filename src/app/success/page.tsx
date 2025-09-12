export default function SuccessPage({ searchParams }: { searchParams: { session_id?: string } }) {
  return (
    <main style={{ padding: 24 }}>
      <h1>Paiement confirmé ✅</h1>
      {searchParams.session_id && (
        <p>
          Session Stripe : <code>{searchParams.session_id}</code>
        </p>
      )}
      <p>Merci pour votre achat. Vous pouvez fermer cette page.</p>
    </main>
  );
}
