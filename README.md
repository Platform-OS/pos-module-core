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

Go into your project directory and use `pos-cli modules install` command, which will create/update `app/pos-modules.json`:

`pos-cli modules install core`

### Pulling the source code

Modules are compatible with [platformOS Check](https://github.com/Platform-OS/platformos-lsp#platformos-check----a-linter-for-platformos), which we highly recommend you to install - it's compatible with any IDE supporting LSP. If you use VSCode, see [VSCode platformOS Check Extension](https://marketplace.visualstudio.com/items?itemName=platformOS.platformos-check-vscode).

To be able to leverage LSP features like autocomplete for `function`/`include`/`graphql` tags, you will need to have the source code of the module in your project. We recommended adding `modules/core` into .gitignore (as you should not monkey patch module files, as it will make it hard to update the module to the newest version in the future) and pulling the source code via pos-cli:

`pos-cli modules pull core`

The default behavior of modules is that the files are never deleted. It is assumed that the developers might not have access to all of the files, and thanks to this feature they are still able to overwrite some of the module's files without breaking them. Because the core module is fully public, it is recommended to delete files on deployment. To do it, ensure your app/config.yml includes the core module in the list `modules_that_allow_delete_on_deploy`:

```
modules_that_allow_delete_on_deploy:
- core
```

## Commands / business logic

We recommend using commands to encapsulate business rules. By following our recommendation, you will improve the consistency of your code, so it will be easy to onboard new developers to the project and easier to take over existing projects. The advantage of using this architecture is that it will be easy to re-use the command - you will be able to execute it both in a live web request, as well as a background job.

We recommend placing your commands in `lib/commands` directory (the old way, before introducing `lib` directory, was `views/partials/lib/commands`)

The naming conventions that we use are `<resource>/<action>`, for example, `users/create.liquid` or `order/cancel.liquid`.

Commands are designed to be easily executed as background jobs [heavy commands - external API call, expensive operations computations, reports]. Each command might produce an [Event](#events)

You can use generator provided by the core module to quickly generate our recommend structure with initial code:

```
pos-cli generate modules/core/generators/command <command>
```

For example

```
pos-cli generate modules/core/generators/command dummy/create
```

The command consists of 3 stages, which we recommend to split into 3 separate files.

![CommandWorkFlow](https://trello-attachments.s3.amazonaws.com/5f2abc6a5aa3bc157e8cee0c/871x721/4b5846b5d0080662351977819dfcc02f/pos-command%282%29.png)

A typical dummy command placed in `app/lib/dummy/create.liquid` would look like this:

```liquid
{%  liquid
  function object = 'commands/dummy/create/build', object: object
  function object = 'commands/dummy/create/check', object: object

  if object.valid
    function object = 'commands/dummy/create/execute', object: object
  endif

  return object
%}
```

### Build

This is the place where you build input for the command. The typical use case is to invoke it with `context.params`, which include input provided by the user via submitting `<form>`, to normalize the input, do necessary type conversions, whitelist properties that the user is allowed to provide to the command, etc.

Example `app/lib/commands/dummy/build.liquid`:

```liquid
{% parse_json data %}
  {
    "title": {{ object.title | downcase | json }},
    "uuid": {{ object.uuid | json }},
    "c__score": 0
  }
{% endparse_json %}

{% liquid
  if data['uuid'] == blank
    hash_assign data["uuid"] = '' | uuid | json
  endif

  return data
%}
```

The example build command will generate uuid if not provided in params, will initiate the field c__score (c stands for cache) with 0 and will ensure that the title provided to the command is downcased.

### Check

This is the place where you validate the input - for example, you ensure all required fields are provided, you check uniqueness, check the format of the input etc. This always returns hash with two keys - `valid` being either `true` or `false`, and if `false` - `errors` with details why validation has failed.

The core module has already quite a few [built-in validators](#validators).

Example `app/lib/commands/dummy/check.liquid`:

```liquid
{% liquid
  assign c = '{ "errors": {}, "valid": true }' | parse_json

  function c = 'lib/validations/presence', c: c, object: object, field_name: 'title'
  function c = 'lib/validations/presence', c: c, object: object, field_name: 'uuid'
  if object.title
    function c = 'lib/validations/presence', c: c, object: object, field_name: 'title'
    function c = 'lib/validations/length', c: c, object: object, field_name: 'title', minimum: 3
    function c = 'lib/validations/length', c: c, object: object, field_name: 'title', maximum: 130
  endif

  function c = 'lib/validations/uniqueness', c: c, object: object, field_name: 'uuid'

  hash_assign object['valid'] = c.valid
  hash_assign object['errors'] = c.errors

  return object
%}

```

### Execute

  If validation succeeds, proceed with executing the command - usually a single [platformOS GraphQL Mutation](https://documentation.platformos.com/get-started/build-your-first-app/saving-data-to-the-database#save-the-data-in-the-database). Any error raised here should be considered 500 server error. If you allow errors here, it means there is something wrong with the code organisation, as all checks to prevent errors should be done in the `check` step.

Example `app/lib/commands/dummy/execute.liquid`:

```liquid
{% liquid
  graphql r = 'dummy/create', args: object

  assign object = r.record_create
  hash_assign object['valid'] = true

  return object
%}
```

Note: Usually the `execute` step is about invoking a GraphQL mutation - if that's the case for your new command, you can use the generic execute function provided by the core module, which is located at `modules/core/public/lib/commands/execute.liquid`. Example usage to invoke GraphQL mutation defined in `app/graphql/dummy/create.graphql`:

```liquid
{%  liquid
  # ...

  if object.valid
    function object = 'modules/core/commands/execute', mutation_name: 'dummy/create', selection: 'record_create', object: object
  endif

  # ...
%}
```

## Hooks

You can choose to create new hooks either on your modules or inside your `app` folder. You can organize them into folders, for example, `app/views/partials/hooks/hook_permission.liquid` or `modules/your-module/public/lib/hooks/hook_permission.liquid`.

Call the `modules/core/lib/commands/hook/fire` function with the `hook` name and optionally pass the `params` attribute. Params will be sent to all hook implementations. You can also set the `merge_to_object` boolean to merge the hook results to one object.

Create Liquid files like `hook_HOOKNAME.liquid`, and the `fire` function will collect all results. It means that these hook implementations have to have a `return` tag - it can be `nil` but the `return` tag is necessary.

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

The Permission Module implements its hook with permission-related permissions, so in `modules/permission/public/views/partials/lib/hooks/hook_permission.liquid` you can find this:

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

For example, you can store additional values in your custom profile structure and you will be able to use the created user's ID as a reference. So your `app/lib/hooks/hook_user_create.liquid` file would look like this:

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

### Debugging events

The core module provides a simple UI to help you preview published events, re-trigger them etc. It is available only in staging environment at /_events

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

The code above will send an email from `kenobi@example.com` to `grievous@example.com` with the subject of `Hello there!` using your liquid partial defined in `app/views/partials/path/to/email_partial.liquid` with the layout file defined in `app/views/layouts/path/to/my_layout.liquid`.

You can pass any additional data as part of the `object` and it'll be available in your `app/views/partials/path/to/email_partial.liquid` partial as `data`:

```liquid
<h1>Hello {{ data.user.first_name }}!</h1>
```

Note: By default platformOS does not send real emails from staging environment - please ensure to [Configure test email on your instance](https://documentation.platformos.com/developer-guide/partner-portal/instances/configuring-test-email) to be able to send emails from staging environment.

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

You can find the core validators at `modules/core/public/lib/validations`

## Generators

Core module provides useful generators to quickly create files.

- command



## Contribution

Please check `.git/CONTRIBUTING.md`
