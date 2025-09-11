// src/app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs"; // Stripe nécessite Node.js (pas l'Edge runtime)

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing Stripe signature", { status: 400 });
  }

  // Corps brut requis par Stripe (pas de json())
  const rawBody = await req.text();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-08-27.basil",
  });

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET! // whsec_xxx depuis Stripe
    );
  } catch (err: any) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Traite les événements utiles
  switch (event.type) {
    case "checkout.session.completed": {
      // const session = event.data.object as Stripe.Checkout.Session;
      // TODO: ton traitement (maj BDD, etc.)
      break;
    }
    default:
      // console.log(`Unhandled event type ${event.type}`);
      break;
  }

  return NextResponse.json({ received: true });
}
