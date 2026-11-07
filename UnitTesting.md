# FireBomba Unit Testing

This document explains the FireBomba unit tests: how to run them, how they work, and what each one checks.

**Current results**

| Part | Tests | Result |
|---|---|---|
| Backend (`backend/test`) | 132 | All pass |
| Frontend (`frontend/test`) | 47 | All pass |
| Raspberry Pi (`raspberry/`) | 33 | 30 pass. 3 can't run on a PC without `onnxruntime`, and 1 is outdated (see [section 7](#7-raspberry-pi-tests-python)) |

---

## 1. What a unit test is in this project

A unit test checks **one piece of code on its own**, such as one controller function, one model, or one screen. Everything that piece talks to is replaced with a **fake**:

| Real thing | Replaced in tests by |
|---|---|
| Supabase database | An in-memory fake table, or a fake model that returns fixed data |
| SMS and email sending | A function that records "an SMS was sent to X with code Y" |
| Supabase Auth (passwords, sessions) | A fake that accepts one known password and returns a fake session |
| Phone APIs (sound, notifications, dialler) | Fakes that record what was asked of them |
| React Native components | Plain named elements that can be found and pressed in a test |

Because nothing real is touched, the tests:
- run in a few seconds,
- need no internet, database, phone or `.env` file,
- give the same result every time,
- can test situations that are hard to create for real, such as an expired code, a database crash or the 6th wrong attempt.

Checking that the real database, SMS or the full login flow work together is **integration or end-to-end testing**, which is outside the scope of this document.

---

## 2. How to run the tests

```bash
# Backend (Node.js)
cd backend
npm test              # runs every file matching test/*.test.js

# Frontend (React Native screens)
cd frontend
npm test              # runs every file matching test/*.test.cjs

# Run one file only
node --test test/authController.test.js

# Raspberry Pi (Python), from the raspberry folder
cd raspberry
python -m unittest risk_detection.test_engine risk_detection.test_service yolo_detection.test_inference yolo_detection.test_mqtt_output
```

The tests use **Node's built-in test runner** (`node:test`) and Python's built-in **`unittest`**, so nothing extra needs to be installed.

Each test prints `ok` (passed) or `not ok` (failed). A failure shows the expected value and the actual value.

---

## 3. How the tests work

### 3.1 The pattern every test follows: Arrange, Act, Assert

```js
test("a new password must be at least 8 characters", async () => {
  // ARRANGE: load the real controller with fakes around it
  const { call, did } = auth();

  // ACT: call the real function with test input
  const res = await call("resetPassword", { resetToken: token, newPassword: "1234567" });

  // ASSERT: check the result and what the code did
  assert.equal(res.code, 400);                   // rejected
  assert.equal(did("updatePassword").length, 0); // password was NOT changed
});
```

Most tests check **two things**:
1. the **answer**: status code, message or what's shown on screen.
2. the **side effects**: what was or wasn't saved, sent or deleted.

The second check matters most for security. For example, "a wrong code is refused" is only half the test. It also has to confirm that no session was handed over.

### 3.2 Backend building blocks (`backend/test/helpers/`)

**`load.js`**
- **`load(file, mocks, { env })`**
  - Reads a real source file such as `src/controller/authController.js` and runs it in a sandbox (Node's `vm` module).
  - Every `require(...)` in that file is answered from `mocks`, so the test decides what the "database" or "SMS service" does.
  - If the file asks for something the test didn't provide, the test fails immediately. This makes hidden dependencies visible.
  - `env` sets fake environment variables, for example `OTP_LOGIN_ENABLED: "true"`.
- **`response()`**: a fake Express `res` object. It remembers the status code and JSON body, so a test can check `res.code === 401`.
- **`plain(value)`**: objects created inside the sandbox don't count as equal to normal objects in strict comparisons, even when their contents match. `plain()` makes a normal copy so the two can be compared.

**`fakeSupabase.js`**
- An in-memory database that understands the Supabase calls the models use: `select`, `insert`, `update`, `delete`, `eq`, `is`, `gte`, `lt`, `order`, `limit`, `single` and `maybeSingle`.
- Tests can put rows in, run the real model, then inspect the rows to see what changed.
- Setting `db.failWith = new Error(...)` makes every query fail, to test error handling.

### 3.3 Frontend building blocks (`frontend/test/helpers/render.cjs`)

- **`loadScreen(file, overrides)`**
  - Compiles the screen's JSX with Babel and runs it with fake imports.
  - React Native components such as `TouchableOpacity` become plain named elements.
  - `useApp()` (the app context), `../services/api`, `expo-av` and similar imports are replaced through `overrides`.
- **`react-test-renderer`** renders the screen in memory, with no phone or emulator. Tests then find elements and read their props.
- **Helpers:**
  - `button(root, "text")` finds the button showing that text.
  - `press(button)` taps it and waits for any async work to finish.
  - `type(input, "text")` types into a text field.
  - `hasText(root, "text")` checks whether some text is on screen.
- **Translations:** the fake `t()` returns the translation key itself, for example `"login.missingFieldsTitle"`. Tests can then check exactly which message appeared, whatever the language.

---

## 4. Backend test files

### 4.1 `otpCode.test.js`: one-time codes (17 tests)

**What it tests:** the real `models/OtpCode.js`, running on the fake database with real `bcrypt` hashing and real random numbers.

| Test | How it works |
|---|---|
| a new code is 6 digits, stored only as a hash, and expires in 5 minutes | Creates a code, then reads the saved row. The plain code must not appear in it, `bcrypt.compare` must match the hash, and `expires_at` must be about 5 minutes ahead. |
| requesting a new code cancels older codes and returns their parked sessions | Creates two codes, each holding a login session. Only the newest stays active, and the old session is returned so it can be closed. |
| a resend keeps holding the session the first code was holding | Creates a code with a session, then resends with `carryPending`. The new code must hold the same session, and nothing is dropped. |
| codes for one purpose never cancel codes for another purpose or user | Creates a reset code, a code for another user, and a login code. All 3 stay active. |
| rows older than a day are cleaned up when a new code is made | Starts with 25-hour-old rows for two users. After user-1 makes a code, only user-1's old row is deleted. |
| the fixed developer code is used only for SMS, only with 6 digits, and never with real SMS | Sets `OTP_DEV_CODE`. It's used for phone codes, but never for email codes, never when `SMS_ENABLED=true`, and never when it isn't exactly 6 digits. |
| the right code is accepted once, and returns the parked session and destination | Verifies with the right code (valid), then tries the same code again, which now gives `no_active_code`. Codes can't be reused. |
| a wrong code counts down the attempts left | Sends 5 wrong codes. The results report 4, 3, 2, 1 and 0 attempts left, and the row's `attempts` reaches 5. |
| after 5 wrong tries even the right code is refused and the code is cancelled | 5 wrong tries, then the right code, gives `too_many_attempts`, and the code is marked used. This blocks guessing. |
| an expired code is refused and cancelled, and its parked session is handed back | Starts with a code that expired a minute ago. The right code gives `expired` and the code is marked used. |
| checking with no code requested says so | Empty table gives `no_active_code`. |
| a code made for login cannot be used for a password reset | A login code checked under purpose `reset` gives `no_active_code`. |
| a new code cannot be requested within 60 seconds of the last one | Last code 30s ago: blocked, wait 30s. 61s ago: allowed. A cooldown on login codes doesn't block reset codes. |
| at most 10 codes per user per day, counting only the last 24 hours | 9 codes are under the limit and 10 are at it. Codes older than 24h and other users' codes don't count. The limit can be changed with `SMS_DAILY_LIMIT_PER_USER`. |
| cancelling active codes returns the sessions they were holding | `invalidateActive` cancels the login code but leaves the reset code alone. |
| database errors are thrown, never treated as a valid or missing code | With `failWith` set, every function throws instead of guessing an answer. |
| destinations with @ are emails and everything else is a phone | Checks `isEmailDestination`. |

### 4.2 `authController.test.js`: sign-up, login, OTP, refresh and password reset (35 tests)

**What it tests:** the real `controller/authController.js` with real `jsonwebtoken` and fakes for Supabase Auth, the user, session and OTP models, and the SMS and email services.

The `auth({...})` helper builds the fakes. Options switch scenarios, for example:
- `otpLogin: true` turns on two-step login.
- `otp: { overLimit: true }` simulates hitting the daily code limit.
- `delivered: false` simulates the SMS or email failing to send.

`did("sms")` lists every SMS the controller tried to send.

**Sign up**

| Test | How it works |
|---|---|
| sign up needs a name, email and password | Five incomplete forms each get 400, and `addUser` is never called. |
| sign up rejects bad phone numbers and emails or phones that are already registered | `12345` is an invalid phone. `" ALICE@mail.com "` matches an existing email after trimming and lowercasing. `012-345 6789` matches Alice's saved `+60123456789`. All get 400 and nothing is created. |
| sign up saves a tidy email and phone, and a blank phone as none | `" New@Mail.com "` is saved as `new@mail.com` and `011-2345 6789` as `+601123456789`. A blank phone is saved as `null`. |
| sign up turns Supabase account errors into clear messages | The fake `addUser` throws `email_exists` (gives 400), then `weak_password` (400, keeping Supabase's message), then any other error (500). |

**Login (one step)**

| Test | How it works |
|---|---|
| login needs an email or phone and a password | Missing fields get 400, and Supabase is never asked. |
| a wrong password and an unknown phone get the same 401 so accounts cannot be guessed | Both get the same `"Invalid email or password"` and no session. |
| logging in with a phone number signs in with the email that owns it | Typing `012-345 6789` makes the controller sign in with `alice@mail.com`. |
| login returns the session and records a 7-day deadline, or 30 days with remember me | Tries `rememberMe` as missing, `false`, `true` and `"true"`. Checks the tokens, user and profile in the response, and that the saved session deadline is now + 7 days or now + 30 days. |
| login fails safely when the user's profile row is missing | The profile lookup returns nothing, giving 500 with no session. |

**Login with OTP turned on**

| Test | How it works |
|---|---|
| with OTP on, a right password sends a code instead of a session | The response has `otpRequired: true` and no session. An email is sent with the code. The hint is masked (`al***@mail.com`). The challenge token decodes to `{ userId, purpose: "login", remembered: true }`. |
| the code goes by SMS when a phone was typed, with only the last 2 digits shown | A phone login gives channel `sms`, hint `**********89`, and the SMS goes to `+60123456789`. |
| asking for SMS on an account without a phone falls back to email | Bob has no phone. Asking for `sms` sends an email instead. |
| over the daily code limit, login stops with 429 and closes the unused session | Gives 429 `SMS_DAILY_LIMIT`. The session Supabase opened is closed and no code is made. |
| if the code cannot be sent, login answers 502 and cancels the code | The send fails, giving 502 with no challenge token. The code is cancelled and its session closed. |

**Checking and resending the login code**

| Test | How it works |
|---|---|
| checking a login code needs a valid, unexpired login challenge | Tries a missing field, garbage, the wrong signing secret, a *reset* token used for login, and an expired token. Each gets 400 or 401, and the code is never checked. |
| each failed code check gets the right status and closes any dropped session | Expired gives 400, too many attempts 429, no code 400, and a wrong code 401 with `attemptsLeft`. Any session the code was holding is closed. |
| a right code hands over a fresh session using the remember-me choice from step 1 | The session is refreshed, and the deadline uses `remembered: true` from the challenge token. The phone is **not** marked verified because the code went by email. |
| a right code sent by SMS also marks the phone number as verified | The destination is a phone number, so `markPhoneVerified("u1")` is called. |
| if the parked session has already ended, the right code still asks to log in again | Supabase's refresh fails, giving 401. |
| resending is blocked during the cooldown and over the daily limit | Gives 429 with `retryAfter: 42`, then 429 `SMS_DAILY_LIMIT`. No code is created either time. |
| resending needs a valid challenge and refuses SMS when no phone is on file | Missing token gives 400, a bad token 401, and SMS for Bob 400 `"No phone number on file"`. |
| a resend can switch to SMS and keeps the waiting session | The SMS goes to Alice's phone, and the code is created with `{ carryPending: true }`. |

**Refresh and logout**

| Test | How it works |
|---|---|
| refresh refuses a missing, rejected, or unknown token | Missing gives 400. Supabase rejecting it gives 403 `INVALID_REFRESH_TOKEN`. A session with no saved deadline gives 403 and is closed. |
| refresh after the session deadline asks for the password again | The deadline is 1 second in the past, giving 403 `SESSION_EXPIRED`. The session row is deleted and the session closed. |
| refresh before the deadline returns new tokens without moving the deadline | Returns new tokens, and `sessionExpiresAt` equals the saved deadline. Refreshing doesn't extend the session. |
| logout ends the session, and still succeeds without a token | Deletes the session row and closes the session. With no token it still returns 200. |

**Forgot password and reset**

| Test | How it works |
|---|---|
| forgot password gives the same answer whether or not the account exists | Compares the responses for an unknown email and for Alice. They must be identical. Only Alice gets an email. |
| forgot password sends by SMS when a phone was typed | `012 345 6789` sends an SMS reset code to `+60123456789`. |
| during the cooldown or over the limit, forgot password quietly sends nothing | Still answers 200 (so nothing is revealed), but no code is created or sent. |
| checking a reset code: unknown accounts look like a wrong code | An unknown account gives the same `401 "Incorrect code"`. A wrong code gives `attemptsLeft`. |
| a right reset code gives a reset token tied to the current password | The token decodes to `purpose: "password_reset"` plus a `stamp` of the account's current `updated_at`. |
| a new password must be at least 8 characters and needs a reset token | A missing token, a missing password and a 7-character password all get 400. The password is never changed. |
| only a fresh, unused reset token can change the password | Garbage, a *login* challenge token, an expired token, and a token with an old stamp (already used) all get 401. |
| a successful reset changes the password and logs out every device | Supabase is asked to set the new password, and **all** the user's sessions are deleted. |
| if Supabase rejects the new password, sessions are kept | Supabase errors, giving 400 with its message. Sessions aren't deleted. |

### 4.3 `alertController.test.js`: alerts and sensor thresholds (10 tests)

**What it tests:** the real `controller/alertController.js`, with fakes for the alert model, the database and the MQTT event emitter. Thresholds: temperature 60 °C, smoke 300 ppm, gas 500 ppm.

| Test | How it works |
|---|---|
| an MQTT message on home/room-N/alerts creates an alert; other topics are ignored | Sends 3 MQTT events on the fake emitter. Only `home/room-3/alerts` creates an alert. `.../sensors` and `room-x` don't. |
| a failed MQTT alert save does not crash the server | The alert model throws, and the event handler catches it. The test passes if nothing crashes. |
| the alert list is the user's own alerts in the app's format with a relative time | Fake alerts from 30s, 5m, 3h and 2d ago are formatted as `30s ago`, `5m ago`, `3h ago` and `2d ago`. A missing room name becomes `Unknown Room`. Only `user-1`'s alerts are requested. |
| marking read and clearing only touch the logged-in user's copy of the alert | The model is called with `(alertId, "user-1")`, the logged-in user. |
| marking read or clearing an alert the user does not have returns 404 | The model reports 0 rows changed, giving 404. |
| mark-all-read and clear-all apply to the logged-in user | Each is called with `"user-1"`. |
| database failures return 500 for every alert action | All 5 actions return `500 "Server error"` when the model throws. |
| a sensor reading needs a room, a known sensor type and a value | Missing fields and `humidity` get 400. An unknown room gets 404. |
| readings just below a threshold make no alert; at or above it they do | For each sensor: just under the limit makes no alert, exactly at the limit makes one, and above the limit makes one. The alert text contains the value, unit, room name and threshold. |
| a flame value of 1 makes an urgent alert and 0 makes none | `flame=1` gives `"Flame detected in Kitchen! Immediate action required."`. `flame=0` gives nothing. |

### 4.4 `profilePhone.test.js`: profile and phone verification (15 tests)

**What it tests:** the real `models/UserProfile.js` (phone formatting and lookups, on the fake database) and the profile functions in `controller/profileController.js`.

| Test | How it works |
|---|---|
| Malaysian phone numbers in any common format are saved the same way | `012-345 6789`, `0123456789`, `60123456789`, `+60123456789` and `+60 12-345 6789` all become `+60123456789`. Empty values become `null`. |
| a valid phone has 8 to 15 digits with an optional + | Checks the boundaries: 7 digits fails, 8 passes, 15 passes and 16 fails. Letters and `++` fail. |
| one login field finds an account by email (any case) or by phone (any format) | `" ALICE@Mail.com "` and `012-345 6789` both find Alice. An unknown email gives `null`. |
| updating a profile changes only that user's row | Updates and verifies u1, then checks the fake table: u2's row is unchanged. |
| the profile is returned in the app's format | Missing fields become `null`. `phoneVerified` is always `true` or `false`. |
| a name must not be blank or longer than 100 characters, and is trimmed | `""`, `"   "` and 101 characters get 400. `"  Alicia  "` is saved as `"Alicia"`. |
| a phone must be valid and not belong to someone else | `123` gives 400 invalid. Bob's number gives 400 already registered. Nothing is saved. |
| a new phone number must be verified again and old verify codes are cancelled | A new number is saved with `phone_verified: false`, and old `verify_phone` codes are cancelled. |
| saving the same number in another format keeps it verified | `012-345 6789` is Alice's current number. Nothing is written and it stays verified. |
| a blank phone removes the number | `""` saves `phone: null, phone_verified: false`. |
| two people saving the same number at once: the database duplicate error becomes a clear 400 | The database throws Postgres error `23505`, giving `400 "Phone number already registered"`. |
| a verify code is only sent when there is an unverified phone and no limit is hit | No phone, already verified, in cooldown, and over the limit each get the correct 400 or 429. No SMS is sent. |
| a verify code is sent by SMS to the phone on file | Bob's code is created for `verify_phone` and sent by SMS to his number. |
| checking a verify code maps each failure to the right status | Missing code gives 400, expired 400, too many tries 429, no code 400 and wrong code 401. The phone is never marked verified. |
| a right code only verifies the phone it was sent to | If the code went to a different number (the user changed it afterwards), the result is 400. If it went to the current number, the phone is marked verified. |

### 4.5 `avatarUpload.test.js`: profile picture upload (8 tests)

**What it tests:** `updateAvatar` and `getAvatar` in `controller/settingsController.js`, and the storage logic in `models/Avatar.js`. The test files are small byte arrays: a JPEG header, a PNG header, and a GIF header (not allowed).

| Test | How it works |
|---|---|
| an upload with no image is refused | Missing body, empty string and a number each get 400. Nothing is uploaded. |
| images over 5 MB are refused with 413; exactly 5 MB is allowed | Builds a JPEG of exactly 5 MB + 1 byte (413) and exactly 5 MB (200). |
| only real JPEG or PNG files are accepted, judged by their content not their name | A GIF, plain text and a cut-off JPEG header each get 415. The check reads the file's first bytes, so renaming a file can't get around it. |
| a JPEG or PNG is saved under the user's id with the right type | Uploaded as `("u1", size, "image/jpeg" or "image/png")`, and the signed URL is returned. |
| storage failures return 500, and the current picture can be read back | Upload throws, giving 500. A user without a picture gets `{ avatarUrl: null }`. |
| the avatars bucket is made private with the size and type limits, only once | With no bucket, it's created once as private with a 5 MB limit and JPEG/PNG only, even across two calls. |
| uploads replace the user's single file and return a 1-day signed link | Uploads to file `u1` with `upsert: true`, and the link lasts 86400 seconds (1 day). |
| a user with no picture gets null, but other storage errors are thrown | "Object not found" gives `null`. "permission denied" is thrown. |

### 4.6 `fireSafetyProgress.test.js`: fire safety quiz progress (9 tests)

**What it tests:** `models/FireSafetyProgress.js` on a small fake table, and the quiz endpoints in `profileController.js`.

| Test | How it works |
|---|---|
| a user with no saved progress is reported as not passed | No row returns `{ quiz_passed: false, passed_at: null, best_quiz_score: null }`. |
| the first pass saves the score and the time it was passed | One `upsert` for `user-1` with `onConflict: "user_id"`, the score, and a valid date. |
| a lower or equal score never overwrites the saved best score | The best score is 9. Scores of 8 and 9 make no write. |
| a higher score updates only the best score and keeps the original pass date | The best score is 8, and a 10 updates only `best_quiz_score`. `passed_at` doesn't change. |
| database errors are thrown instead of looking like an unpassed quiz | Both functions throw when the database fails. |
| quiz pass rejects missing, failing, too-high and non-whole scores without saving | `undefined`, `{}`, `null`, `"abc"`, 7, 0, 11, 8.5 and -9 all get 400, and the model is never called. |
| quiz pass accepts scores 8 to 10, including numbers sent as text, for the logged-in user | 8, 9, 10 and `"10"` are each saved for `user-1`. |
| progress is returned in the app's format and defaults to not passed | Database column names are converted to `{ quizPassed, passedAt, bestQuizScore }`. |
| database failures return a 500 instead of crashing | The model throws, giving `500 "Server error"`. |

### 4.7 Earlier backend test files

These were already in the project and use the same sandbox-and-fakes approach.

| File | Test | What it checks |
|---|---|---|
| `roomAccess.test.js` | users can access only rooms associated with their bilik | Room access is granted only through the user's household. |
| | missing and unassigned users or rooms cannot grant access | No household, or a room not in a household, means no access. |
| | missing identifiers deny access without querying the database | A missing user or room ID is denied straight away. |
| | database failures propagate without granting access | A database error is never treated as "allowed". |
| `bilik.test.js` | home reads Bilik directly even when the household has no rooms | The home screen data comes from the household (Bilik) table. |
| | missing household ids never query null or expose unowned rooms | No household ID means no query and no rooms. |
| | room and notification membership queries stay scoped to their Bilik | Room and notification queries are filtered by household. |
| | legacy room overview retains its response and isolates shared spaces | The older room endpoint keeps its format and keeps shared spaces separate. |
| | digital twin selects only public Bilik labels | The 3D model only gets public household labels. |
| | Bilik database failures propagate rather than looking like empty results | Errors aren't hidden as "no rooms". |
| | home routes use the Bilik model and keep the frontend room response | The home endpoints keep the response format the app expects. |
| | home rejects invalid or other-household room requests before querying | Bad or foreign room IDs are rejected first. |
| | authentication derives room access from the Bilik model | The login middleware uses household membership. |
| | digital twin controller gets Bilik labels from the model and preserves layout format | The 3D layout response is unchanged. |
| `cameraSettings.test.js` | camera reads and writes use the selected room rather than the user's default room | The camera on/off setting applies to the chosen room. |
| | camera endpoints reject invalid and other-household room IDs before reading or writing settings | `0`, `-1`, `1.5` and text get 400. Another household's room gets 403. |
| | camera updates require booleans and accept an already-saved setting | `1`, `"false"` and `null` are rejected. Only `true`/`false` are accepted. |
| `criticalRiskAlerts.test.js` | critical episodes create existing-pipeline alerts once per room and rearm after a lower level | 5 critical readings in a row make 1 alert. After the risk drops, a new critical reading alerts again. |
| | failed alert creation retries on the next critical update | If saving the alert fails, the next critical reading tries again. |
| | cloud MQTT invokes the alert pipeline only for valid, fresh, nonretained risk messages | Old, broken or replayed (retained) MQTT messages are ignored. |
| `fireAlarmBroadcast.test.js` | fire alerts reach every household, role, and registered device through the existing pipeline | Every user and every registered phone is notified. |
| | a fire in a shared space is broadcast and multiple warnings retain separate unread records | Shared areas alert everyone, and each warning is tracked separately. |
| | all-user and device queries paginate and Expo requests stay within 100 messages | Large user lists are fetched in pages, and push batches stay within Expo's limit of 100. |
| | push failures preserve each user's in-app fire notification | If a push fails, the in-app alert is still saved. |
| | no warnings never create notifications or pushes | No warning means nothing is sent. |
| | older push-token schemas retain the default alarm fallback | Old phones without a chosen sound get the default alarm. |
| `riskStatusStream.test.js` | streams scaled scores and preserves flame override severity per room | Risk scores stream per room, and flame detection keeps its severity. |
| | replays a fresh result and rejects malformed, stale and out-of-order results | New viewers get the latest result. Bad or old results are dropped. |
| | cloud MQTT subscribes to risk and routes risk messages into SSE | MQTT risk messages reach the app's live stream. |
| | sensor SSE authorizes room access and unsubscribes risk on disconnect | The live stream checks room access and cleans up when closed. |
| `sensorTimestamp.test.js` | Pi local times resolve to the same instant regardless of server timezone | Pi times are read as Malaysia time. |
| | explicit timezone offsets are preserved | Times with `+08:00` etc. are kept as given. |
| | missing or invalid timestamps remain invalid | Bad times are never turned into "now". |
| `twinSensorStream.test.js` | saved Pi timestamps use Malaysian time before reaching the event streams | Saved readings carry the correct time. |
| | successful sync publishes saved readings to independent frontend and twin subscribers | The app and the 3D model each receive new readings. |
| | twin stream loads the database snapshot, receives live updates and cleans up on close | The 3D stream starts with saved data, then live data. |
| | twin closes and unsubscribes when its initial database query fails | A failed start closes cleanly. |
| | digital twin consumes named sensor events and ignores stale, invalid and older readings | The 3D model ignores bad or old readings. |

---

## 5. Frontend test files

### 5.1 `fireSafetyQuiz.test.cjs`: fire safety quiz screen (8 tests)

**Setup:** a fake quiz with 12 questions. Every option's text names its question, for example `Q3-opt1`, so the test always knows which option is correct even though the screen shuffles the questions. `answer(n)` answers the shown questions and gets the first `n` right.

| Test | How it works |
|---|---|
| 10 of the questions are shown, each with 4 options | 40 options on screen, labelled "Question 1 of 10" to "Question 10 of 10". There's no 11th. |
| submit stays disabled until every question has an answer | Submit is disabled after 0 and after 1 answer, and enabled after all 10. |
| choosing another option for the same question replaces the first choice | Tapping option 1 then option 2 leaves only option 2 selected. |
| 8, 9 or 10 correct is a pass and is saved with the score and checklist | Shows "You passed" and the badge. `saveFireSafetyProgress({ checklist, quizPassed: true }, score)` is called once. |
| 7 or fewer correct is a fail and nothing is saved | 0 and 7 correct show "Not yet" with no badge, and the save function is never called. |
| after submitting, answers are locked and each correct answer is marked | All options become disabled, and each correct option shows a tick icon. |
| if saving a pass fails, a retry button saves it again | The first save returns `pendingSync`, so "Not saved yet" and a Retry button appear. Retry saves again, and the message goes away. |
| try again clears the answers and the result | The score disappears, no option is selected, and Submit is disabled again. |

### 5.2 `authScreens.test.cjs`: login and sign-up screens (11 tests)

**Setup:** `loginUser` and `registerUser` (the API calls) are replaced with fakes. `Alert.alert` and `alert` record what pop-up appeared.

**Login screen**

| Test | How it works |
|---|---|
| login with an empty or blank field shows a message and never calls the server | 5 combinations of empty or space-only fields each show "missing fields", and the API is never called. |
| login sends the trimmed email, the password as typed, and the remember-me choice | `"  a@b.com "` is sent as `a@b.com`. The password `" pw "` is sent exactly as typed. Remember-me is sent as `false`, or `true` after ticking it. |
| a successful login stores the user and both tokens | `login(user, accessToken, refreshToken, { sessionExpiresAt, rememberMe })` is called. |
| when a code is needed, login opens the OTP screen instead of logging in | Navigates to `Otp` with the challenge details, and `login` isn't called. |
| server errors, missing tokens and lost connections each show a message and do not log in | A server error shows its message. A missing refresh token shows "session was not returned". A network error shows "connect error". |
| the sign-in button shows a spinner and is disabled while waiting | The API is held open (not answered yet). The button is disabled with a spinner, and returns to normal after the answer arrives. |

**Sign-up screen**

| Test | How it works |
|---|---|
| each sign-up mistake shows its own message and nothing is sent | 10 bad forms are tried: blank name, empty email, two bad emails, two bad phones, blank password, 5-character password, mismatched passwords and terms not accepted. Each shows its own message, and the API is never called. |
| phone is optional, and common phone formats are accepted | Blank, `012-345 6789` and `+60123456789` are all accepted. |
| declining the terms after accepting them blocks sign-up again | Accept, then reopen and Decline, gives "must agree to terms". |
| a valid sign-up sends trimmed details, shows success and goes back to login | `registerUser("Ali", "ali@mail.com", "secret1", "0123456789")`, then a Success pop-up, then `goBack()`. |
| server errors and lost connections show a message and stay on the form | A server error or no connection shows a message, and the screen doesn't go back. |

### 5.3 `alertsScreen.test.cjs`: alerts list screen (5 tests)

| Test | How it works |
|---|---|
| each alert shows its warning, room and time | Both fake alerts' title, room and time are on screen. |
| the header shows the unread count, with 's' only for more than one | 1 unread gives suffix `""`, 2 unread gives `"s"`, and 0 shows "all caught up". |
| tapping an alert marks that alert read; Clear removes that alert | Tapping alert 2 gives `markNotificationRead(2)`. Its Clear button gives `clearNotification(1)`. |
| mark all read and clear all only appear when they would do something | Both buttons call the right functions. With 0 unread, "mark all read" is hidden but "clear all" stays. |
| an empty list shows the empty message and no action buttons | Shows the "empty" text with no buttons. |

### 5.4 `notificationSettings.test.cjs`: notification settings screen (8 tests)

**Setup:** the notification permission, the sound player (`expo-av`) and the app context are faked. `setTimeout` is captured so a test can trigger the 4-second auto-stop without waiting.

| Test | How it works |
|---|---|
| the push status follows the phone's permission, with a shortcut to settings when off | Granted shows "on" with no button. Denied shows "off" with an "Open settings" button that calls `Linking.openSettings()`. |
| the device status shows checking, on, or off with a retry button | `null`, `true` and `false` each show the right text. Retry only appears when the device is off. |
| retry registers the device again and re-checks the permission | Calls `registerPush()`, then the status updates to "on". |
| choosing a different alarm sound saves it; choosing the current one does nothing | Tapping the current sound does nothing. Tapping "siren" calls `changeAlarmSound("siren")` once. |
| preview plays one looping sound at a time, and pressing again stops it | Playing classic loops it. Playing siren stops classic first. Pressing stop stops siren and doesn't restart it. |
| a preview stops by itself after 4 seconds and when the screen closes | The captured timer is 4000 ms, and firing it stops the sound. Closing the screen also stops it. |
| the test alarm reports success, the server's error, or that the device is not registered | Each of the three results shows the matching pop-up. |
| the test alarm button is disabled while sending so it cannot be sent twice | While the send is held open, the button is disabled with a spinner. It's enabled again afterwards. |

### 5.5 Earlier frontend test files

| File | Test | What it checks |
|---|---|---|
| `emergencyCall.test.cjs` | opening, cancelling, and dismissing confirmation never dial | 999 is never dialled without confirming. |
| | explicit confirmation opens tel:999 once even with rapid repeated presses | Double-tapping confirm dials once only. |
| | phone handoff failure leaves manual dialing guidance and allows cancellation | If the phone app can't open, the user is told to dial manually. |
| | home reserves a separate emergency row during normal, loading, and error states | The emergency button is always visible outside the scroll area. |
| `cameraVisibility.test.cjs` | camera-enabled rooms show the video; disabling and refocusing removes the whole feed section | The video appears only when the camera is on. |
| | Security loads each room and saves only the confirmed room's switch | Changing one room's camera doesn't affect others. |
| `roomData.test.cjs` | login loads shared rooms using the authenticated bilik and logout clears them | Rooms come from the household, and logout clears them. |
| | room loading errors can be retried through the same household loading path | Retry after an error works. |
| | a household with no rooms loads as an empty list | An empty household isn't an error. |
| `sensorHistoryGraph.test.cjs` | history stays within the SVG even with future synced times | The graph never draws outside its box. |
| `tutorialLayout.test.cjs` | bubble follows upper features and sits above bottom tabs and emergency button | Tutorial bubbles don't cover key buttons. |
| | small screens and larger translated bubbles stay within the viewport | Longer BM text still fits on small phones. |
| | unavailable or fully offscreen features use a bounded bubble without a false spotlight | Missing features don't get a misleading highlight. |
| `tutorialOverlay.test.cjs` | tour skips unavailable room controls, supports Back, and finishes on Home | The tutorial steps and buttons work. |
| | room steps open an actual room and Skip closes the guide on Home | Room steps open a real room, and Skip works. |

---

## 6. Proof the tests catch mistakes

A test that always passes is useless, so each important rule below was **broken on purpose** in the app code. The matching tests were run, and then the change was undone. Every mistake was caught.

| Deliberate mistake | Caught by |
|---|---|
| OTP allows 6 wrong tries instead of 5 | `otpCode.test.js` (2 tests failed) |
| OTP resend cooldown 30s instead of 60s | `otpCode.test.js` |
| Daily code limit off by one (`>` instead of `>=`) | `otpCode.test.js` |
| New password minimum 7 instead of 8 | `authController.test.js` |
| Reset token can be reused | `authController.test.js` |
| Remember-me sent as text `"true"` ignored | `authController.test.js` |
| Password reset doesn't log out other devices | `authController.test.js` |
| Sensor threshold uses `>` instead of `>=` | `alertController.test.js` |
| Mark-read uses the wrong user | `alertController.test.js` |
| Avatar 5 MB limit off by one | `avatarUpload.test.js` |
| New phone number stays "verified" | `profilePhone.test.js` (2 tests failed) |
| Phone verified by a code sent to a different number | `profilePhone.test.js` |
| Quiz pass mark 7 instead of 8 | `fireSafetyQuiz.test.cjs` |
| Login accepts space-only fields | `authScreens.test.cjs` |
| Sign-up password minimum 5 instead of 6 | `authScreens.test.cjs` |
| Alerts header says "alerts" for 1 alert | `alertsScreen.test.cjs` |
| Choosing the current alarm sound saves it again | `notificationSettings.test.cjs` |

---

## 7. Raspberry Pi tests (Python)

These were already in the project and use Python's `unittest`.

| File | What it checks |
|---|---|
| `risk_detection/test_engine.py` | **Risk score:** weights and the Normal, Warning and Critical thresholds, including exact boundary values. Flame forces Critical but keeps the score. Invalid inputs are rejected. **Sensor cache:** waits for all inputs, keeps rooms separate, newest reading wins, old readings expire, bad data doesn't replace good data. **Camera fallback:** 5 disconnects switch to sensor-only scoring and 5 connects switch back. Streaks are counted per room. Duplicate, old and missing messages are handled. |
| `risk_detection/test_service.py` | MQTT subscription, routing of risk inputs, publishing weighted results to the cloud, and the local alarm turning on at Critical and off when the risk drops. The alarm also works while the cloud is disconnected. |
| `yolo_detection/test_inference.py` | Model probabilities aren't softmaxed twice, image normalisation and padding are correct, and the wrong number of output classes is rejected. |
| `yolo_detection/test_mqtt_output.py` | A disconnected camera doesn't report "no fire", a connected camera includes predictions, and no detections are published as zero. |

**Known issues:**
- `test_inference.py` needs `onnxruntime`. It's installed on the Pi but not on a normal PC. Install it with `pip install onnxruntime` to run it.
- One test in `test_service.py` (`test_old_entry_point_does_not_launch_another_bridge`) calls a `main` function that no longer exists in `service.py`. The test needs updating to match the current code.

---

## 8. Things noticed while writing the tests

These don't make any test fail, but they're worth knowing:

1. **`processSensorReading` in `alertController.js` isn't used.** Its route is commented out in `alerts.routes.js`, and it calls `db.query(...)`, which is MySQL-era code that doesn't exist on the Supabase client. The threshold rules are unit tested with a fake database, but the function would fail if the route were turned back on. Live fire alerts actually come from the Pi risk engine and `criticalRiskAlerts.js`.
2. **Flame check is strict:** `value === 1`. A flame reading sent as the text `"1"` wouldn't raise an alert. Temperature, smoke and gas don't have this problem.
3. **Password length rules differ:**
   - The sign-up screen requires **6** characters (Supabase's default).
   - Password reset requires **8**.
   - Consider using the same minimum everywhere.
4. **A debug line is left in login:** `console.log("Did it pass through here?")` in `authController.js`.
5. **The `testing/` folder** contains an unused Jest setup with empty folders. All real tests live in `backend/test`, `frontend/test` and `raspberry/`.

---

## 9. What isn't unit tested and why

| Not unit tested | Reason | How it should be tested instead |
|---|---|---|
| Real Supabase queries and Row Level Security | Needs a real database | Integration tests against a test Supabase project |
| Real SMS and email delivery | Costs money and needs a real phone or inbox | Manual test |
| Full login flow in the app | Covers many parts working together | End-to-end or manual test |
| Screen layout and colours | Visual, not logic | Manual review or screenshots |
| YOLO model accuracy | Measured with a dataset, not a pass/fail rule | K-fold validation results in `yolo_scripts/runs` |
| MQTT broker and the Pi hardware | Needs real devices | System testing on the hardware |
