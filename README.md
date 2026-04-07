Local CLI
=========

CLI for [Local](https://localwp.com), the #1 local WordPress development tool.

> **Fork notice:** This is a community fork of the [original Local CLI](https://github.com/getflywheel/local-cli) by [WP Engine / Flywheel](https://localwp.com), which is no longer actively maintained. This fork is licensed under the same [MIT license](https://github.com/getflywheel/local-cli/blob/master/package.json). All credit for the original work goes to the Flywheel/WP Engine team.

## Goal

Make every Local action available from the command line so the GUI is optional, not required. Start sites, stop sites, list and filter them -- all without opening the app.

[![License](https://img.shields.io/npm/l/@getflywheel/local-cli.svg)](https://github.com/coreydonenfeld/local-cli/blob/main/package.json)

<!-- toc -->
* [Requirements](#requirements)
* [What's new in this fork](#whats-new-in-this-fork)
* [Roadmap](#roadmap)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Requirements

* [Local](https://localwp.com) 5.9.2 or newer (introduces the Local GraphQL API)
* Node.js 18+

# What's new in this fork

* **sites** -- Interactive TUI site manager: search, start/stop/restart, open in browser, copy URL, add and delete sites -- all from one command
* **list-sites** -- Filter by status, sort by name or status, output as JSON, filter by group
* **start-site / stop-site** -- Progress feedback, name lookup (case-insensitive), domain matching
* **restart-site** -- Force restart sites stuck in stopping/starting/restarting state
* **add-site** -- Create new sites from the CLI with locally installed PHP/MySQL/nginx versions
* **delete-site** -- Fully remove sites (services, config, files)
* **Modernized stack** -- oclif v4, native fetch, cross-platform open/copy, zero vulnerabilities

# Roadmap

- [x] Interactive TUI site manager (`sites`)
- [x] Start / stop / restart with stuck-state detection
- [x] Add new site (`add-site`)
- [x] Delete site (`delete-site`)
- [x] Site groupings in list and TUI views
- [ ] Pull/push to WP Engine environments (see [docs/pull-push-prd.md](docs/pull-push-prd.md))
- [ ] Database export/import
- [ ] Live Links management

# Usage
<!-- usage -->
```sh-session
$ git clone https://github.com/coreydonenfeld/local-cli.git
$ cd local-cli
$ npm install
```

**For development** (runs TypeScript directly, no build step):
```sh-session
$ ./bin/dev.js COMMAND
```

**For production** (compile first, then run):
```sh-session
$ npm run build
$ ./bin/run.js COMMAND
```

**Optional:** link globally so you can run `local-cli` from anywhere:
```sh-session
$ npm link
$ local-cli COMMAND
```
<!-- usagestop -->

Running `local-cli` with no arguments launches the interactive site manager.

# Commands
<!-- commands -->
* [`local-cli sites`](#local-cli-sites) -- **interactive site manager** (default)
* [`local-cli list-sites`](#local-cli-list-sites) (alias: `ls`)
* [`local-cli start-site`](#local-cli-start-site) (alias: `start`)
* [`local-cli stop-site`](#local-cli-stop-site) (alias: `stop`)
* [`local-cli restart-site`](#local-cli-restart-site) (alias: `restart`)
* [`local-cli add-site`](#local-cli-add-site) (alias: `add`, `new`)
* [`local-cli delete-site`](#local-cli-delete-site) (alias: `delete`, `rm`)
* [`local-cli help [COMMAND]`](#local-cli-help-command)

## `local-cli sites`

Interactive site manager -- browse, search, start, and stop sites from a single command. This is the default command when running `local-cli` with no arguments.

```
USAGE
  $ local-cli sites
```

Features:
* Type to search/filter sites, tab to autocomplete
* Shortcut keys: `o` open, `c` copy URL, `s` start/stop, `r` restart, `d` delete, `b` back, `q` quit
* Sites grouped by Local's site groups, color-coded status
* Add new sites with `+` from the site picker
* Stuck-state detection with force restart option

_See code: [src/commands/sites.ts](https://github.com/coreydonenfeld/local-cli/blob/main/src/commands/sites.ts)_

## `local-cli list-sites`

List all Local sites with optional filtering, sorting, and grouping.

```
USAGE
  $ local-cli list-sites [--format table|json] [--order name|status]
      [--status running|halted|stopped|all] [--group NAME]

ALIASES
  $ local-cli ls

EXAMPLES
  $ local-cli ls
  $ local-cli ls --status running
  $ local-cli ls --format json
  $ local-cli ls --group Projects
```

_See code: [src/commands/list-sites.ts](https://github.com/coreydonenfeld/local-cli/blob/main/src/commands/list-sites.ts)_

## `local-cli start-site`

Start a Local site and all of its services. Accepts a site ID, name, or domain.

```
USAGE
  $ local-cli start-site SITEID

ALIASES
  $ local-cli start

EXAMPLES
  $ local-cli start my-site
  $ local-cli start 6mC6PsMCh
```

_See code: [src/commands/start-site.ts](https://github.com/coreydonenfeld/local-cli/blob/main/src/commands/start-site.ts)_

## `local-cli stop-site`

Stop a Local site and all of its services. Accepts a site ID, name, or domain.

```
USAGE
  $ local-cli stop-site SITEID

ALIASES
  $ local-cli stop

EXAMPLES
  $ local-cli stop my-site
```

_See code: [src/commands/stop-site.ts](https://github.com/coreydonenfeld/local-cli/blob/main/src/commands/stop-site.ts)_

## `local-cli restart-site`

Restart a Local site. Useful for unsticking sites stuck in `stopping`, `starting`, or `restarting` state.

```
USAGE
  $ local-cli restart-site SITEID

ALIASES
  $ local-cli restart

EXAMPLES
  $ local-cli restart my-site
```

_See code: [src/commands/restart-site.ts](https://github.com/coreydonenfeld/local-cli/blob/main/src/commands/restart-site.ts)_

## `local-cli add-site`

Create a new Local site. Walks through an interactive setup using your locally installed PHP, MySQL/MariaDB, and web server versions.

```
USAGE
  $ local-cli add-site

ALIASES
  $ local-cli add
  $ local-cli new
```

_See code: [src/commands/add-site.ts](https://github.com/coreydonenfeld/local-cli/blob/main/src/commands/add-site.ts)_

## `local-cli delete-site`

Permanently delete a Local site -- stops services, removes from Local's config, and deletes all site files.

```
USAGE
  $ local-cli delete-site SITEID

ALIASES
  $ local-cli delete
  $ local-cli rm

EXAMPLES
  $ local-cli delete my-site
```

_See code: [src/commands/delete-site.ts](https://github.com/coreydonenfeld/local-cli/blob/main/src/commands/delete-site.ts)_

## `local-cli help [COMMAND]`

Display help for local-cli.

```
USAGE
  $ local-cli help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```
<!-- commandsstop -->
