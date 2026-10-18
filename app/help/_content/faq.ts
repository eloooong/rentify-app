// Generated once from docs/faq-draft.md (the review copy). The site renders this file;
// keep both in sync when the text changes. [[TBD]] markers render as
// "To be decided" badges.
import type { Block, FaqGroup } from "./types";

export const faqIntro: Block[] = [
  {
    type: "p",
    text: "Terms used on the site: **Owner** (lists a device), **Renter** (rents a device), **Booking** (one reservation of a listing for a date range), **Deposit** (an amount held and released after a clean return), **Handover** and **Return** (the two moments the device changes hands).",
  },
];

export const faqGroups: FaqGroup[] = [
  {
    id: "renting",
    title: "Renting",
    questions: [
      {
        q: "How do I rent a device?",
        blocks: [
          {
            type: "p",
            text: "Browse or search for a device, pick your dates on the listing page, and send a booking request. The owner accepts or declines. If they accept, you pay, then arrange pickup in the booking chat.",
          },
        ],
      },
      {
        q: "Why do I have to wait for the owner to accept?",
        blocks: [
          {
            type: "p",
            text: "Owners decide who borrows their devices. If an owner does not respond within [[TBD: 48 hours]], the request expires and you are not charged.",
          },
        ],
      },
      {
        q: "Can I change or cancel a booking?",
        blocks: [
          {
            type: "p",
            text: "Yes, but what you get back depends on who cancels and how close the start date is. [[TBD: cancellation and refund rules by booking stage.]] You are not charged for a request the owner declines or that expires.",
          },
        ],
      },
      {
        q: "How do I pick up and return the device?",
        blocks: [
          {
            type: "p",
            text: "At handover and again at return, you and the owner complete a short condition checklist and take photos in the app. Both of you confirm. The photos protect both sides if there is a disagreement about damage.",
          },
        ],
      },
      {
        q: "What if the device is late or not returned?",
        blocks: [
          {
            type: "p",
            text: "[[TBD: late-return fees and what happens when a device is not returned.]]",
          },
        ],
      },
    ],
  },
  {
    id: "listing",
    title: "Listing",
    questions: [
      {
        q: "How do I list a device?",
        blocks: [
          {
            type: "p",
            text: "Choose **Lend**, select a category, and fill in the details for that category (for example battery cycles for a drone). Add clear photos, a daily price, a deposit and your pickup area. Publish when you are ready.",
          },
        ],
      },
      {
        q: "How much deposit should I ask for?",
        blocks: [
          {
            type: "p",
            text: "[[TBD: deposit rule, either a fixed percentage of device value or owner-set with a maximum.]]",
          },
        ],
      },
      {
        q: "Can I decline a request?",
        blocks: [
          {
            type: "p",
            text: "Yes. You can accept or decline each request. You are not required to give a reason.",
          },
        ],
      },
      {
        q: "What happens if my device is damaged?",
        blocks: [
          {
            type: "p",
            text: "Take the handover and return photos, and confirm the return condition in the app. If you report damage, the deposit stays held while the issue is reviewed. [[TBD: who bears the loss in each damage and theft case, and how disputes are decided.]]",
          },
        ],
      },
      {
        q: "How do I get paid?",
        blocks: [
          {
            type: "p",
            text: "After a clean return, the deposit is released and a payout is recorded for you. [[TBD: payout method and timing. The MVP records payouts manually.]]",
          },
        ],
      },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    questions: [
      {
        q: "How does payment work?",
        blocks: [
          {
            type: "p",
            text: "After the owner accepts, you pay the rental fee and a deposit. [[TBD: payment gateway and accepted methods.]] Rentify does not store your card details. Payments go through a hosted payment form from the payment provider.",
          },
        ],
      },
      {
        q: "What is the deposit?",
        blocks: [
          {
            type: "p",
            text: "A deposit is an amount held when you pay and released after the owner confirms the device came back in good condition. [[TBD: whether the deposit is a hold on your card or a charge that is later refunded, and for how long it can be held.]]",
          },
        ],
      },
      {
        q: "When do I get my deposit back?",
        blocks: [
          {
            type: "p",
            text: "After the owner confirms a clean return. If the owner does not respond within [[TBD: 48 hours]] of the return, the booking may complete automatically. [[TBD: confirm this rule.]] If a booking is disputed, the deposit stays held until the dispute is resolved.",
          },
        ],
      },
      {
        q: "Where can I see my payments?",
        blocks: [
          {
            type: "p",
            text: "Under **Bookings → Transactions**: rental fees, deposit holds, refunds and payouts, with dates and statuses.",
          },
        ],
      },
    ],
  },
  {
    id: "safety",
    title: "Safety",
    questions: [
      {
        q: "How does Rentify protect owners and renters?",
        blocks: [
          {
            type: "ul",
            items: [
              "Every booking has a chat that is only visible to the two people on the booking.",
              "Condition checklists with photos are recorded at handover and return.",
              "Reviews are two-sided and unlock only after a completed booking.",
              "You can report a listing, a user or a booking, and our team reviews reports.",
            ],
          },
        ],
      },
      {
        q: "What items are not allowed?",
        blocks: [
          {
            type: "p",
            text: "See the **Prohibited items** page.",
          },
        ],
      },
      {
        q: "How do I report a problem?",
        blocks: [
          {
            type: "p",
            text: "Use **Report** on a listing, a user profile or a booking. Describe what happened. Our team reviews reports and can hide listings or suspend accounts.",
          },
        ],
      },
      {
        q: "Should I arrange payment or pickup outside Rentify?",
        blocks: [
          {
            type: "p",
            text: "No. Keep your booking, chat and payment on Rentify. Off-platform deals are not covered by deposits, evidence or dispute handling.",
          },
        ],
      },
      {
        q: "How do you handle my personal data?",
        blocks: [
          {
            type: "p",
            text: "See the **Privacy** page. Short version: we collect only what is needed to run bookings, and we do not store card details.",
          },
        ],
      },
      {
        q: "I can't use the site the way I need to. Who do I contact?",
        blocks: [
          {
            type: "p",
            text: "Use the feedback form on the Help page. We are working toward WCAG 2.1 AA for the main flows: keyboard use, screen-reader support, and enough contrast.",
          },
        ],
      },
    ],
  },
];
