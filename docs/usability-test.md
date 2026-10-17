# Rentify Usability Test Kit

A script for running moderated usability sessions with 5 participants on two tasks: **list a device** and **book a device**. Anyone who has never seen the app can run a session using only this file.

- Session length: about 30 minutes per participant.
- Device: participant's own phone if possible (Rentify is mobile-first); otherwise a laptop with the browser window narrowed to phone width.
- Roles: one **moderator** (talks to the participant) and one **note-taker** (fills in the observation sheet). If you are alone, record the screen and audio with the participant's consent and fill in the sheet afterwards.

## Before the session

- [ ] Open the app on a **test environment** with seeded demo listings (never production data).
- [ ] Create two accounts for the participant to use, so they do not have to sign up on the spot:
  - `owner-test@[test domain]` for Task 1
  - `renter-test@[test domain]` for Task 2
  - Keep credentials in a private note, not in this file.
- [ ] Have 2-3 photos of a gadget on the participant's phone (or a shared folder) for Task 1.
- [ ] Make sure at least one listing is available on the dates you plan to ask about for Task 2.
- [ ] Payment is in **test mode**. Have the gateway's published test card number ready to read out if needed.
- [ ] Print or open one observation sheet per participant (see below).
- [ ] Start the screen recording (with consent).

## 1. Moderator introduction (read aloud)

> Thanks for helping us today. We are testing a website where people rent out gadgets to each other, like a laptop or a drone. **We are testing the website, not you.** You cannot do anything wrong, and if something is confusing, that is exactly what we need to find out.
>
> I will ask you to do two tasks. I will not be able to help you during the tasks, because I want to see what happens when you use it on your own. If you get stuck, just tell me what you would try next.
>
> Please **think aloud**: say what you are looking at, what you are trying to do, and what you expect to happen. Honest opinions are helpful, including negative ones.
>
> Everything you do is for research. We will not share your name. Is it okay if we record the screen and your voice? You can stop at any time.

Wait for consent. If they decline, take notes only.

## 2. Think-aloud warm-up (1 minute)

Ask the participant to describe what they see on the home page, out loud, without clicking anything. Prompt gently if they go silent: "What are you thinking right now?" Do not answer questions about the interface. Reply: "What would you do if I were not here?"

## 3. Tasks

Read each task aloud and also hand it over on a card. The wording describes a goal, not the screens or buttons.

### Task 1: List a device (as an owner)

**Scenario:** "You have a [drone / laptop / camera] at home that you do not use much. You would like to earn some money by letting other people borrow it for a few days. You are signed in as an owner. Put your device up so others can find it."

- Start state: signed in as `owner-test`, on the home page.
- End state: a listing with title, price, deposit and at least one photo is published and visible to others.
- Time limit: 10 minutes. If they are still working at 10 minutes, stop and mark as not completed.

### Task 2: Book a device (as a renter)

**Scenario:** "Next weekend you need a [drone / laptop / VR headset] for a school project. Find one that suits you and arrange to have it for [Saturday to Monday]. You are signed in as a renter."

- Start state: signed in as `renter-test`, on the home page.
- End state: a booking request exists for the chosen dates. If the owner account has accepted it in the background, continue until the participant reaches the payment confirmation (test card); otherwise stop at "request sent".
- Time limit: 10 minutes.

### Moderator rules during tasks

- Do **not** point at, name or hint at buttons, pages or menu labels.
- If the participant asks "Should I click this?", say "What would you do if I were not here?"
- Intervene **only** if they are stuck for over 2 minutes on the same step, or are about to leave the site or break the test data. Record any intervention as an **assisted** step.
- After each task, ask: "On a scale of 1 (very difficult) to 7 (very easy), how easy was that task?"
- Follow-up questions (after the task, not during):
  - "What did you expect to happen when you [action]?"
  - "Was there anything you were unsure about?"
  - "Was anything missing that you were looking for?"

## 4. Success criteria

Record these for each task.

| Measure               | How to record                                                         |
| --------------------- | --------------------------------------------------------------------- |
| **Completed unaided** | Yes / No / Completed with assistance (note how many hints)            |
| **Time on task**      | Seconds from reading the task to reaching the end state               |
| **Errors**            | Count wrong clicks, wrong pages, form validation errors, backtracking |
| **Confidence**        | 1-7 ease rating after the task                                        |

**Targets** (from the project reference): at least **80%** of participants complete both tasks unaided. With 5 participants, that means at least 4 of 5 per task.

Also note usability observations such as hesitation, confusion, comments about trust or safety, accessibility problems (zoom, screen reader, keyboard) and any slow loading on a phone connection.

## 5. Observation sheet (one per participant)

**Participant:** P__ **Date:** ______ **Device / browser:** ______ **Moderator / note-taker:** ______

| Task            | Step                                          | Completed unaided? (Y/N/Assisted) | Time (s) | Errors | Observations / quotes | Severity (0-4) |
| --------------- | --------------------------------------------- | --------------------------------- | -------- | ------ | --------------------- | -------------- |
| 1 List a device | Find where to list                            |                                   |          |        |                       |                |
| 1 List a device | Choose category and fill details              |                                   |          |        |                       |                |
| 1 List a device | Set price and deposit                         |                                   |          |        |                       |                |
| 1 List a device | Add photos                                    |                                   |          |        |                       |                |
| 1 List a device | Publish                                       |                                   |          |        |                       |                |
| 2 Book a device | Find a suitable device (browse/search/filter) |                                   |          |        |                       |                |
| 2 Book a device | Check availability and price                  |                                   |          |        |                       |                |
| 2 Book a device | Select dates and request                      |                                   |          |        |                       |                |
| 2 Book a device | Pay (test mode)                               |                                   |          |        |                       |                |

**Ease rating (1-7):** Task 1: ___ Task 2: ___

**Severity scale:** 0 = not a problem, 1 = cosmetic, 2 = minor (slows them down), 3 = major (causes errors or needs a workaround), 4 = blocker (task cannot be completed).

## 6. System Usability Scale (SUS)

After both tasks, ask the participant to rate each statement from **1 (strongly disagree) to 5 (strongly agree)**. Ask them to answer quickly and not skip any.

1. I think that I would like to use this system frequently.
2. I found the system unnecessarily complex.
3. I thought the system was easy to use.
4. I think that I would need the support of a technical person to be able to use this system.
5. I found the various functions in this system were well integrated.
6. I thought there was too much inconsistency in this system.
7. I would imagine that most people would learn to use this system very quickly.
8. I found the system very cumbersome to use.
9. I felt very confident using the system.
10. I needed to learn a lot of things before I could get going with this system.

**Scoring:**

- For odd items (1, 3, 5, 7, 9): contribution = answer - 1.
- For even items (2, 4, 6, 8, 10): contribution = 5 - answer.
- Add the 10 contributions and multiply by **2.5** to get a score from 0 to 100.
- Average the scores across participants. About **68** is the commonly cited average; above 80 is good.

| Participant | Q1  | Q2  | Q3  | Q4  | Q5  | Q6  | Q7  | Q8  | Q9  | Q10 | SUS score |
| ----------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --------- |
| P1          |     |     |     |     |     |     |     |     |     |     |           |
| P2          |     |     |     |     |     |     |     |     |     |     |           |
| P3          |     |     |     |     |     |     |     |     |     |     |           |
| P4          |     |     |     |     |     |     |     |     |     |     |           |
| P5          |     |     |     |     |     |     |     |     |     |     |           |
| **Average** |     |     |     |     |     |     |     |     |     |     |           |

## 7. Closing questions (5 minutes)

- "What was the best thing about the experience?"
- "What was the most frustrating or confusing part?"
- "Would you feel comfortable renting out your own device here? Renting someone else's? What would make you more comfortable?"
- "Is there anything you would change?"

Thank the participant. Stop the recording. Save notes the same day.

## 8. After all sessions: turning findings into issues

1. Put every observed problem in one list, regardless of who found it.
2. Merge duplicates and count how many of the 5 participants hit each problem.
3. Rate severity (0-4 scale above). Priority = severity first, then how many participants were affected.
4. Write each problem as a GitHub issue using the template below. Label it `usability`, plus the phase or area, and `A` or `B` depending on who owns the code.
5. Fix severity 3 and 4 first. Review the rest in the weekly meeting.

### Findings summary

| Measure                  | Result | Target       |
| ------------------------ | ------ | ------------ |
| Task 1 completed unaided | _/5    | at least 4/5 |
| Task 2 completed unaided | _/5    | at least 4/5 |
| Median time Task 1       |        |              |
| Median time Task 2       |        |              |
| Average SUS              |        | 68+          |

### Issue template

```
Title: [usability] <short problem statement>

Where: <route/screen, e.g. /owner/listings/new>
Task: <Task 1 | Task 2>
Participants affected: <n of 5>
Severity: <0-4>

What happened:
<observed behavior, with a quote if available>

Why it matters:
<effect on task completion or trust>

Suggested change:
<smallest change that could fix it>

Evidence:
<recording timestamp / screenshot / observation sheet reference>

Done when:
<observable result, e.g. "3 of 3 retest participants find the publish button unaided">
```

### Prioritized findings list

| #   | Problem | Task | Participants affected | Severity | Issue link | Owner (A/B) |
| --- | ------- | ---- | --------------------- | -------- | ---------- | ----------- |
| 1   |         |      |                       |          |            |             |
| 2   |         |      |                       |          |            |             |
| 3   |         |      |                       |          |            |             |
