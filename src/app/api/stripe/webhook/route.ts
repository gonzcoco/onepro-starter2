// src/app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // Stripe nécessite Node.js (pas l'Edge)

// ------------------------------------------------------------------
// 1) Clients externes (Stripe + Supabase en mode "server/admin")
// ------------------------------------------------------------------
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

// Utilise SUPABASE_URL si tu l’as créée, sinon NEXT_PUBLIC_SUPABASE_URL
const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabase = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE! // ⚠️ Service Role (pas l'anon key)
);

// Petit utilitaire pour renvoyer du JSON proprement
function json(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ------------------------------------------------------------------
// 2) Handler du webhook
// ------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // a) Récupération et validation de la signature Stripe
  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing Stripe signature" }, 400);

  // IMPORTANT : on lit le corps brut, sans JSON.parse
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET! // whsec_…
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err?.message);
    return json({ error: `Invalid signature: ${err?.message}` }, 400);
  }

  // b) Routage des événements Stripe
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // L'utilisateur a payé : on active ce qu'il faut
        const session = event.data.object as Stripe.Checkout.Session;

        // Optionnel : récupérer plus d'infos (line items, abo, customer)
        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["line_items.data.price.product", "subscription", "customer"],
        });

        // Id utilisateur : passe-le quand tu crées la session (client_reference_id ou metadata.user_id)
        const userId =
          fullSession.client_reference_id ||
          (fullSession.metadata?.user_id as string | undefined);

        // Email client
        const email =
          fullSession.customer_details?.email ||
          (typeof fullSession.customer === "string"
            ? undefined
            : (fullSession.customer as Stripe.Customer | null)?.email ?? undefined);

        // Id d'abonnement si tu utilises des subscriptions
        const subscriptionId =
          typeof fullSession.subscription === "string"
            ? (fullSession.subscription as string)
            : (fullSession.subscription as Stripe.Subscription | null)?.id;

        // Premier article (price/product) si tu utilises Checkout avec des prix
        const firstItem = (fullSession as any)?.line_items?.data?.[0];
        const priceId = firstItem?.price?.id as string | undefined;
        const productId = firstItem?.price?.product?.id as string | undefined;

        // Si abonnement, récupère les dates de période et le statut
        let currentPeriodEndISO: string | null = null;
        let subscriptionStatus: string | null = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          subscriptionStatus = sub.status;
          currentPeriodEndISO = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null;
        }

        // c) --- ÉCRITURE EN BASE (Supabase) ---
        // Table "subscriptions" (adapte si tes colonnes sont différentes)
        if (userId) {
          const { error } = await supabase
            .from("subscriptions")
            .upsert(
              {
                user_id: userId,
                stripe_subscription_id: subscriptionId ?? null,
                status: subscriptionStatus ?? "paid", // ou "active" pour un one-shot
                price_id: priceId ?? null,
                product_id: productId ?? null,
                current_period_end: currentPeriodEndISO,
                customer_email: email ?? null,
                stripe_checkout_session_id: fullSession.id,
              },
              { onConflict: "stripe_checkout_session_id" } // unique key conseillée
            );

          if (error) {
            console.error("Supabase upsert error:", error);
            return json({ error: "DB error" }, 500);
          }
        } else {
          console.warn(
            "[webhook] checkout.session.completed SANS userId — ajoute client_reference_id ou metadata.user_id quand tu crées la session."
          );
        }

        // (Optionnel) : email de confirmation, log, etc.
        return json({ received: true }, 200);
      }

      // Tu peux gérer d’autres événements ici
      // case "invoice.paid": { ... }
      // case "customer.subscription.deleted": { ... }

      default:
        // On reçoit souvent plein d’événements : on ignore ceux qu’on n’utilise pas
        return json({ received: true, ignored: event.type }, 200);
    }
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    return json({ error: err?.message ?? "handler error" }, 500);
  }
}
