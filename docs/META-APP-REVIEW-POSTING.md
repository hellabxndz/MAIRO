# Meta App Review, round 2: posting to Instagram and Facebook

> **On hold (October 2026).** MAIRO no longer offers social media posting, so
> this review isn't needed and shouldn't be submitted. It isn't on any plan
> sold today: only subscribers still on the earlier Scale plan (`SCALE`) keep
> Social Manager. These steps are kept in case posting comes back. If it
> does, it has to be put back on a plan first. The steps below that set a
> business to MAIRO Scale (`SCALE_V2`) would need the earlier plan, or the
> plan that brings posting back, instead.

MAIRO's Social Manager can publish to a business's own Instagram and Facebook
Page. The code is built and tested: a post goes out only after the business
approves it, and it is shown as published only when Meta confirms it.

What it can't do yet is publish **for customers**. Meta lets an app use these
three permissions with ordinary Facebook accounts only after App Review:

| Permission | What MAIRO uses it for |
| --- | --- |
| `instagram_basic` | Finding the Instagram professional account linked to the business's Page, and its username |
| `instagram_content_publish` | Publishing the photos, carousels and Reels the business approved to that Instagram account |
| `pages_manage_posts` | Publishing the posts the business approved to its own Facebook Page |

`pages_read_engagement` and `pages_show_list` were approved in round 1.

Until approval, anyone with a role on MAIRO's Meta app (admin, developer or
tester) can already connect and post. That is how the steps below are done.

---

## Step 1 — Meta's developer dashboard (about 10 minutes)

On developers.facebook.com → your MAIRO app:

1. **Add the Instagram use case.** Use cases → Add use case → the one for managing
   content on Instagram, with the **Facebook Login** option (not "Instagram
   Login"). MAIRO asks for `instagram_basic` and `instagram_content_publish`
   through Facebook Login. Without this use case, Meta refuses the whole
   "Connect Instagram" login with "Invalid Scopes".
2. **Add `pages_manage_posts`.** Under the Pages use case ("Manage everything on
   your Page"), add it to the permissions.
3. Check that **Business Verification** is still complete (Settings →
   Basic / Business verification), and that the Privacy Policy URL is
   `https://<your domain>/privacy` and the data deletion URL is
   `https://<your domain>/data-deletion`.

Meta renames these menus from time to time. If a name doesn't match, look for
the permission name itself.

## Step 2 — Post once yourself (about 10 minutes)

Meta won't take the submission until each permission has been used
successfully at least once. Use your own accounts. You need an admin role on
the app, and an Instagram **Business or Creator** account linked to your
Facebook Page; a personal Instagram can't be posted to by any app.

1. In AIOS → Organizations, open your own business and set the plan to
   **MAIRO Scale** (`SCALE_V2`). Set by hand like this, it's recorded as
   active, which Social Manager needs.
2. In MAIRO: **Social Manager → Instagram → Connect Instagram**, and allow
   everything in Meta's dialog.
3. **Social Manager → Facebook → Allow posting on Facebook**, and allow it.
4. Make or pick one post on each network, then press **Approve & post now**.
   It appears on your Instagram and on your Page within a minute.
5. Open **AIOS → Live Meta check** and run it for your business. The new
   **Ready for posting** line should be green, meaning:
   - all three permissions are granted;
   - your Instagram is linked to the Page;
   - at least one post has gone out on each network.

   If it isn't green, the line says what's missing.

These are real posts on your own accounts. Delete them afterwards if you like.

## Step 3 — Set up the account the reviewer will use

1. Create a MAIRO login for Meta's reviewer (for example
   `metareview@<your domain>`) and finish setup with a test business.
2. In AIOS, set that business to **MAIRO Scale**. Social Manager is only on
   Scale, and billing is enforced, so without this the reviewer sees an
   upgrade screen and the review fails.
3. Meta's reviewers usually connect their own test Facebook account. If you
   want them to use yours instead, give it a tester role on the app and a
   Page with a linked Instagram professional account.

## Step 4 — Record the screencast (one per permission, or one covering all three)

Meta rejects recordings that don't show the whole path. Record in English, at
a readable size, with no other tabs. Show:

1. Signing in to MAIRO as the reviewer account.
2. **Social Manager → Instagram → Connect Instagram.** Show Meta's dialog,
   with the requested permissions visible, then press Continue/Allow.
3. Back in MAIRO, the connected Instagram username shown on the page
   (`instagram_basic`).
4. A post in MAIRO: the picture and caption, and the preview showing exactly
   how it will look.
5. **Approve & post now**, then the "Posted to your Instagram" message
   (`instagram_content_publish`).
6. The same post open on Instagram (phone or instagram.com), so the reviewer
   sees it really went out.
7. **Social Manager → Facebook → Allow posting on Facebook**, with Meta's
   dialog showing `pages_manage_posts`, then Allow.
8. A Facebook post approved with **Approve & post now**, then the same post on
   the Facebook Page (`pages_manage_posts`).
9. Optional, but it helps: the Social Manager calendar, where nothing posts
   until it's approved.

## Step 5 — What to paste into the submission

**instagram_basic**
> MAIRO is an AI advertising and social media assistant for small businesses.
> When a business connects Instagram in MAIRO's Social Manager, MAIRO uses
> instagram_basic to find the Instagram professional account linked to the
> business's Facebook Page and show its username, so the business can confirm
> which account its posts will be published to. MAIRO doesn't read other
> users' content.

**instagram_content_publish**
> MAIRO's Social Manager writes posts for the business: a caption with the
> business's own photo, or an image MAIRO made that the business chose. Each
> post is shown as an exact preview and is published only when the business
> presses "Approve & post now" or approves it for a scheduled time. MAIRO uses
> instagram_content_publish only to publish those approved posts to the
> business's own Instagram professional account. Nothing is ever published
> without the business's approval.

**pages_manage_posts**
> MAIRO's Social Manager can also publish the business's approved posts to its
> own Facebook Page. The business turns this on with "Allow posting on
> Facebook", which asks for this permission in its own dialog, and each post is
> published only after the business approves it. MAIRO uses pages_manage_posts
> only to create those approved posts on the Page the business chose. It doesn't
> edit or delete posts it didn't create.

**Reviewer instructions** (the "how to test" box):
> 1. Go to https://<your domain>/sign-in and sign in with the login below.
>    This business is on MAIRO Scale, which includes Social Manager.
> 2. Open Social Manager → Instagram → Connect Instagram, and allow the
>    permissions with a Facebook account that manages a Page with a linked
>    Instagram Business or Creator account.
> 3. Open a post, check the preview, and press "Approve & post now". The post
>    appears on the Instagram account.
> 4. Open Social Manager → Facebook → "Allow posting on Facebook", allow it,
>    then approve a post with "Approve & post now". It appears on the Page.
>
> Login: <reviewer email> / <password>

## Step 6 — After Meta approves

1. In Vercel, set `META_POSTING_APPROVED=1` for Production and redeploy.
   Every screen, the pricing cards and the privacy policy then stop saying
   "Publishing once Meta approves".
2. Set the reviewer's business back to no plan in AIOS, or delete it.

## If Meta rejects it

Meta's message names the permission and the reason. The usual ones:

- **The screencast doesn't show the permission being used.** Re-record that
  part, ending on the post live on Instagram or Facebook.
- **The reviewer couldn't get in.** Usually the reviewer business wasn't on
  MAIRO Scale, or the password changed.
- **Use isn't clear.** Make the description say who presses the button and
  what gets published.
