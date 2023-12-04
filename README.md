# platformOS Core Module

The goal of this module is to extend the platformOS module system's possibilities.

With the **hook system**, it's possible to use **SOLID's Open/Closed Principle** so you can modify the business logic in other modules in the application folder without changing the source of existing modules.

There is a **variable storage** that can be used to set variables and get their value in the global scope.

You can register your module and theme into the **module registry** with `hook_module_info`. In this info file, you can define your module's name, version, type (module or theme), and dependencies. Module registry will handle **dependency management** and **outdated versions**.

There are **module helper** functions to check if a module or theme exists in the system so that the other modules can use installed ones without complex dependencies.

The core module also provides a command and the graphql mutation for **email sending**.

## Installation

This module is published in Partner Portal Modules Marketplace - https://partners.platformos.com/marketplace/pos_modules/126

To install it, you have to have [pos-cli](https://github.com/mdyd-dev/pos-cli#overview) installed.

Go into your project directory and use `pos-cli modules install` command , which will create/update `app/pos-modules.json`:

`pos-cli modules install core`

### Pulling the source code

Modules are compatible with [platformOS Check](https://github.com/Platform-OS/platformos-lsp#platformos-check----a-linter-for-platformos), which we highly recommend you to install - it's compatible with any IDE supporting LSP. If you use VSCode, see [VSCode platformOS Check Extension](https://marketplace.visualstudio.com/items?itemName=platformOS.platformos-check-vscode)

In order to be able to levarage LSP feature like autocomplete for `function`/`include`/`graphql` tags, you will need to have source code of the module in your project. We recommended adding `modules/core` into .gitignore (as you should not monkey patch module files, as it will make it hard to update the module to the newest version in the future) and pull the source code via pos-cli:

`pos-cli modules pull core`

The default behaviour of modules is that the files are never deleted. It is assumed that the developers might not have access to all of the files, and thanks to this feature they are still able to overwrite some of the modules files without breaking them. Because core module is fully public, it is recommended to delete files on deploy. In order to do it, ensure your app/config.yml includes core module in the list `modules_that_allow_delete_on_deploy`:

```
modules_that_allow_delete_on_deploy:
- core
```

## Hooks

You can choose to create new hooks either on your modules or inside your `app` folder. You can organize them into folders, for example, `app/views/partials/hooks/hook_permission.liquid` or `modules/your-module/public/views/partials/lib/hooks/hook_permission.liquid`.

Call the `modules/core/lib/commands/hook/fire` function with the `hook` name and optionally pass the `params` attribute. Params will be sent to all hook implementations. You can also set the `merge_to_object` boolean to merge the hook results to one object.

Create Liquid files named like `hook_HOOKNAME.liquid`, and the `fire` function will collect all results. It means that these hook implementations have to have a `return` tag - it can be `nil` but the `return` tag is necessary.

It's possible to define **alter hooks** to modify the existing data before it is handled (for example saved, rendered, etc).

### Examples

#### Returning with arrays

For example, we don't need params in the [Permission Module's](https://github.com/Platform-OS/pos-module-permission) `get_permissions` function:

```
{% liquid
  function permissions = 'modules/core/lib/commands/hook/fire', hook: 'permission'
  return permissions
%}
```

and `results` will contain all available permissions in your application.

The Permission Module implements its own hook with permission-related permissions, so in `modules/permission/public/views/partials/lib/hooks/hook_permission.liquid` you can find this:

```
{% liquid
  assign permissions = '["permissions.manage"]' | parse_json
  return permissions
%}
```

The [User Module](https://github.com/Platform-OS/pos-module-user) implements user related permissions:

```
{% liquid
  assign permissions = '["user.create", "user.delete", "user.update"]' | parse_json
  return permissions
%}
```

You can create your own permissions if you create `hook_permission.liquid` for example in `app/views/partials/hooks/hook_permission.liquid` or in a custom module.

```
{% liquid
  assign permissions = '["custom_permission", "another_custom_perm"]' | parse_json
  return permissions
%}
```

After that, firing the `permission` hook will get the following result:

```
["permissions.manage","user.create", "user.delete", "user.update","custom_permission","another_custom_perm"]
```

#### Passing params

For example, in the User Module, we created a hook called `user_create`. It looks like this:

```
assign params = '{}' | parse_json | hash_merge: created_user: user.user, hook_params: hook_params
function results = 'modules/core/lib/commands/hook/fire', hook: 'user_create', params: params, merge_to_object: true
hash_assign user['hook_results'] = results
```

It means that if you want to do something when a user is created, you only need to create a file (or files in different folders or modules, it's up to you) called `hook_user_create`, and in this file, you add your functionality.

For example, you can store additional values in your custom profile structure and you will be able to use the created user's ID as a reference. So your `app/views/partials/lib/hooks/hook_user_create.liquid` file would look like this:

```
{% parse_json args %}
  {
    "user_id": {{ params.created_user.id | json }},
    "first_name": {{ params.hook_params.first_name | json }},
    "last_name": {{ params.hook_params.last_name | json }},
    "dog_name": {{ params.hook_params.dog_name | json }},
    "favorite_color": {{ params.hook_params.favorite_color | json }}
  }
{% endparse_json %}
{% liquid
  graphql profile = 'profiles/create', args: args
  return profile
%}
```

Or another real-world example can be to subscribe the user to a newsletter by calling an API of a 3rd party service. In this case, your `hook_user_create.liquid` file would look like this:

```
{% if params.hook_params.subscribe %}
  {% parse_json data_to_send %}
    {
      "email": {{ params.created_user.email | json }}
    }
  {% endparse_json %}
  {% graphql g, data: data_to_send %}
    mutation ($data: HashObject!)  {
      api_call: api_call_send(
        data: $data
        template: { name: "nl_subscribe" }
      ) {
        response{ status body }
        errors {
          message
        }
      }
    }
  {% endgraphql %}
{% endif %}

{% return nil %}
```

Where `app/api_calls/nl_subscribe.liquid` would be something like this:

```
---
request_type: "POST"
to: "https://your-api-call.com"
request_headers: '{
  "Content-Type": "application/json"
}'
---
{{ data | json }}

```

## Events

Events are a way to organize code. They allow you to add your logic to existing commands. They are executed asynchronously in the background.

### Defining the event

Event has a type and structure. Type of the event has to be unique and as it not scoped. You define an event by creating a file in `app/lib/events/your_event_name`. The type of the event should be the name of something that happened in the past. In metadata, you define the structure of data that is passed to the event. You have to validate if certain parameters are passed.

`app/lib/events/something_happened`

```
---
metadata:
  event:
    foo_id
---
{% liquid
  assign c = '{ "errors": {}, "valid": true }' | parse_json

  function c = 'modules/core/lib/validations/presence', c: c, object: event, field_name: 'foo_id'

  # You can also enhance event object
  hash_assign event['bar'] = 'extra info'

  return c
%}
```

### Publishing event

Once something happened in the application you can publish the event. Events should be published directly from the page or the command.
`app/views/pages/debug.liquid`

```
{% liquid
  assign object = null | hash_merge: foo_id: "12345"
  function _ = 'modules/core/commands/events/publish', type: 'something_happened', object: object
%}
```

Once the event is published we validate if the event exists and is valid. It is stored in activities. So far nothing happens, to consume the event you have to write consumer.

### Handling events

To execute code on a particular event you have to write consumer. There can be many consumers in one event. To create a consumer create a file in `app/lib/consumers/<name_of_the_event>/<name_of_your_file>`

`app/lib/consumers/something_happened/do_something.liquid`

```liquid
{% liquid
  assign message = 'executed consumer for the event' | append: event
  log message
%}
```

For this example, the event object will look as:

```json
{
  "id": "ActivityStreams::Activity.1382917",
  "uuid": "22ed7654-9521-42dd-b5f0-02e79c03f749",
  "foo_id": "12345",
  "type": "something_happened",
  "date": "2023-03-17T10:42:41.957Z"
  "bar": "extra info"
}
```

Events can be published and consumed by different parties. In the application, you can write a consumer that reacts to events published by the module.

## Status handling

You can create a new status with a command so you will have a status history in your entity. When you create a status, the `status_created` event will be published with the status object, so you can create your consumer and set your entity's status cache (for example `c__status`) field.

### Creating a status

```liquid
{% liquid
  function res = 'modules/core/commands/statuses/create', name: 'app.statuses.transactions.succeeded', reference_id: '2', requester_id: 'payment_webhook', reference_schema: 'modules/payments/transaction'
%}
```

You can also set `timestamp` and `payload` if you need.

### Deleting a status

```liquid
{% liquid
  function res = 'modules/core/commands/statuses/delete', id: '75'
%}
```

### Loading a status

```liquid
{% liquid
  function res = 'modules/core/queries/statuses/find', id: '76'
%}
```

### Searching for statuses

```liquid
{% liquid
  function res = 'modules/core/queries/statuses/search', name: 'app.statuses.transactions.succeeded', requester_id: 'stripe_webhook'
%}
```

### Deleting a status

```liquid
{% liquid
  function res = 'modules/core/commands/statuses/delete', id: '75'
%}
```

## Variable storage

You can set a variable with

```
function res = 'modules/core/lib/commands/variable/set', name: 'VARIABLE_NAME', value: 'VARIABLE_VALUE'
```

This function will return the created variable's value.

And you can get a variable value with

```
function variable_va = 'modules/core/lib/queries/variable/find', name: 'VARIABLE_NAME', default: 'DEFAULT_VALUE'
```

You can pass the `type` argument that can be an array, integer, float, boolean, or object.

## Session storage

You can store small data in a session. A session is connected with the current browser session.

```liquid
  assign data = null | hash_merge: bar: 'some value'

  function _ = 'modules/core/commands/session/set, key: 'foo', value: data
  function data = 'modules/core/commands/session/get', key: 'foo'
  function _ = 'modules/core/commands/session/clear', key: 'foo'
```

## Module registry

You can register your module or theme by implementing `hook_module_info` under `partials/lib/hook/`. An info file should look like this:

```
{% parse_json info %}
{
  "name": "pOS Admin",
  "machine_name": "admin",
  "type": "module",
  "version": "1.0.0",
  "dependencies": [
    "core"
  ]
}
{% endparse_json %}

{% return info %}
```

It is possible to list the registered modules and themes with

```
function modules = 'modules/core/lib/queries/registry/search, type: 'module`
function themes = 'modules/core/lib/queries/registry/search, type: 'theme`
function all = 'modules/core/lib/queries/registry/search
```

## Email sending

The core module provides a command for email sending that you can call in your app or other modules:

```
{% parse_json object %}
  {
    "to":      "grievous@example.com",
    "from":    "kenobi@example.com",
    "cc": [],
    "bcc": [],
    "subject": "Hello there!",
    "layout": "path/to/my_layout",
    "partial": "path/to/email_partial",
    "data": { "user": " { "first_name:" "John" } }
  }
{% endparse_json %}
{% function _ = 'modules/core/lib/commands/email/send', object: object %}
```

The code above will send an email from `kenobi@example.com` to `grievous@example.com` with the subject of `Hello there!` using your liquid partial `email_partial.liquid` with the layout file `my_layout`.
You can pass any additional data as part of the `object` and it'll be available in your `email_partial.liquid` partial as `data`.

## Headscripts hook

The core module provides a hook for other modules to register their head scripts (CSS, JS, metadata, etc).
The modules can implement a `hook_headscripts.liquid` file that returns standard HTML, then you can render the aggregated head scripts in your layout using the `headscripts/search` query:
```
<!DOCTYPE html>
<html lang="en">
  <head>
    {% function headscripts = 'modules/core/lib/queries/headscripts/search' %}
    {{ headscripts }}
  </head>
```

The [Theme manager](https://github.com/Platform-OS/pos-module-theme-manager) module uses the same hook to add theme-specific head scripts from the active theme.

## Helpers

You can check if a module or theme is installed on the project:

```
function exists = 'modules/core/lib/queries/module/exists', type: 'module'
```

## Validators

The core module provides some basic helpers for data validation.
These validators can check if all required fields are provided, check uniqueness, data types (numbers are really numbers and not letters), etc. Validators always return a hash with two keys - valid being either true or false, and if false - errors with details of why the validation has failed.
You can find the core validators at `modules/core/public/views/partials/lib/validations`

## Generators

Core module provides useful generators to quickly create files.

- command



## Contribution

Please check `.git/CONTRIBUTING.md`
