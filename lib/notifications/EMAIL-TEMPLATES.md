# Booking email drafts

Draft copy for B3.1. The recipient and trigger for each template are defined in the [delivery plan](EMAIL-DELIVERY.md). Send one plain-text message with the stated subject. If an HTML variant is added later, use the same copy and an escaped link.

`{{booking_url}}` is the only placeholder. The worker builds it from the configured canonical HTTPS Rentify origin and the trusted booking UUID as `/bookings/{id}`. The page asks the recipient to sign in and verifies that they belong to the booking. The subject and body are fixed text. Each email points to the booking for current status, dates, and actions.

## Request received

- Key: `booking_requested_v1`
- Subject: New rental request on Rentify

```text
You have a new rental request. Open the booking to review the rental dates and respond before the request expires.

View booking: {{booking_url}}

Rentify
```

## Request accepted

- Key: `booking_accepted_v1`
- Subject: Your rental request was accepted

```text
The owner accepted your rental request. Open the booking to check the payment deadline and continue to checkout if payment is still available.

View booking: {{booking_url}}

Rentify
```

## Payment confirmed

- Key: `booking_paid_v1`
- Subject: Payment confirmed for your Rentify booking

```text
Rentify confirmed payment for this booking. Open the booking to check the pickup date and coordinate the handover.

View booking: {{booking_url}}

Rentify
```

## Booking cancelled

- Key: `booking_cancelled_v1`
- Subject: Your Rentify booking was cancelled

```text
This booking was cancelled. Open the booking for its current status and any refund information.

View booking: {{booking_url}}

Rentify
```

## Pickup reminder

- Key: `booking_pickup_reminder_v1`
- Subject: Your Rentify pickup is tomorrow

```text
Pickup is scheduled for tomorrow in Manila time. Check the booking and confirm the pickup arrangements with the other participant.

View booking: {{booking_url}}

Rentify
```

## Return reminder

- Key: `booking_return_reminder_v1`
- Subject: Your Rentify return is tomorrow

```text
Return is scheduled for tomorrow in Manila time. Check the booking and confirm the return arrangements with the other participant.

View booking: {{booking_url}}

Rentify
```

## Sample rendering

Use this fictional booking link for review previews. A fixture generator can render all six subjects and bodies by substituting this same value.

```text
Subject: Your Rentify return is tomorrow

Return is scheduled for tomorrow in Manila time. Check the booking and confirm the return arrangements with the other participant.

View booking: https://rentify.example.test/bookings/00000000-0000-4000-8000-000000000001

Rentify
```
