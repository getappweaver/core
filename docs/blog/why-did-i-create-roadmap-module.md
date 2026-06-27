# What the roadmap module provides

- a UI to create your own kanban board for your NIP-34 repo
- a UI to create issues
- filter issues, by text or labels/hashtags
- show and write comments to issues
- set status of an issue: Open, Applied/Merged/Resolved, Closed, Draft
- board management, setting columns for an issue: pending, in progress, rejected/archived, shipped/done
- a way to set the column in the board by the maintainer
- a way to crowdfund an issue with BTC donations, more about this later

A roadmap is a board that holds issues of a [NIP-34](https://nips.nostr.com/34) git repository. Unlike issues, the board itself is solely controled by the board author which also required to be the git repository owner. But there are also some parallel semantics between an issue status and a board column. 

Git is very important in AppWeaver, maybe because we use solely git to distribute AppWeaver code and its plugins. But also every user would potentially work with git repositories in their own project workspaces, mainly to keep history of their files.

If we go back to AppWeaver roadmaps, we have similar features like issues (bug reports or feature requests), and a kanban like board attached to the repository. I've created boards for AppWeaver core repository and my official plugins.

You can access roadmap from the app, or from our website. Both requires a NOSTR connection to submit an issue.

# What I'm planning to have next for the roadmap module

- Issue creation should be easier: Create an issue with a burner NOSTR key. Or anonymous. Since we order the issues by the zapped amount, I think there is a way to filter spam easily.
- Personal board creation: right now boards are AppWeaver specific. I believe any user would like to use it for tracking progress of their own tasks. Not sure how to provide "private" boards though, because if it's going to work with public relays, it is going to be public. Only way is either creating SQLite tables to mimic NOSTR entities or encrypting events but there is metadata leaking
- Export a todo as an issue: This is what I need at the moment. I have local todo items for my development tasks. But a simple way create a roadmap issue out of todos could be helpful. I'm even thinking about relying to AI for this.