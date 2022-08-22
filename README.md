# PlatformOS Core module

The golal of this module is to extend platformOS module system's possiblities.

With the **hook system**, it's pssible to use **SOLID's Open/Closed Principle** so you can modify the business logic in other modules on in the application folder, so you don't need to change the existing modules's source.

There is a **variable storage** that can be used to set variables and get their value in the global scope.

You can register your module and theme into the **module registry** with `hook_module_info`. In this info file you can define you module's name, version, type (module or theme) and the dependencies. Module registry will handle **dependency management** and **outdated versions**.

There are **module helper** functions to check if a module or theme exists in the system, so the other modules can use installed ones without hard dependencies. 

## Hooks

You can create new hooks on your modules or inside you `app` folder, it depends on you.

The only thing what you need to do is call `modules/core/lib/commands/hook/fire` function with the `hook` name and optionally you can pass `params` attribute. Params will be send to all hook implementations. You also can set `merge_to_object` boolean if you want to merge the hook results to one object.

After that, you can create liquid files named with `hook_HOOKNAME.liquid`, and `fire` function will collect all results. It means that these hook implementations have to have `return` tag - it can be `nil` but `return` tag is necessary.

It's possible to define **alter hooks**. With them you can modify the existing data before it will be handled (for example saved, rendered etc).

### Examples

#### Returning with arrays

For example we don't need params in [Permission module's](https://github.com/Platform-OS/pos-module-permission) `get_permissions` function:

```
{% liquid
  function permissions = 'modules/core/lib/commands/hook/fire', hook: 'permission'
  return permissions
%}
```

and `results` will contain all available permissions in your application.

Permission module implements it's own hook with permission related permission, so in `modules/permission/public/views/partials/lib/hooks/hook_permission.liquid` you can find this:

```
{% liquid
  assign permissions = '["permissions.manage"]' | parse_json
  return permissions
%}
```

[User module](https://github.com/Platform-OS/pos-module-user) implements the user related permissions:

```
{% liquid
  assign permissions = '["user.create", "user.delete", "user.update"]' | parse_json
  return permissions
%}
```

And you can create your own permissions if you create `hook_permission.liquid` for example in `app/views/partials/hooks/hook_permission.liquid` or in a custom module.

```
{% liquid
  assign permissions = '["custom_permission", "another_custom_perm"]' | parse_json
  return permissions
%}
```

After that, fire `permission` hook will get the following result:

```
["permissions.manage","user.create", "user.delete", "user.update","custom_permission","another_custom_perm"]
```

#### Passing params

For example in User module, we created a hook called `user_create`. It seems like that:

```
assign params = '{}' | parse_json | hash_merge: created_user: user.user, hook_params: hook_params
function results = 'modules/core/lib/commands/hook/fire', hook: 'user_create', params: params, merge_to_object: true
hash_assign user['hook_results'] = results
```

It means that if you want to do something when a user is created, you only need to create a file (or files in different folders or modules, it's up to you) called `hook_user_create` and in this file you add your functionality.

For example you can store additional values in your custom profile structure and you will be able to use the created user's ID as a reference. So your `app/views/partials/lib/hooks/hook_user_create.liquid` file would seems like this:

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

Or another real world example can be to subscribe the user to a newsletter with calling an API of a 3rd party service. In this case your `hook_user_create.liquid` file would seems like this:

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

## Variable storage

You can set a variable with
```
function res = 'modules/core/lib/commands/variable/set', name: 'VARIABLE_NAME', value: 'VARIABLE_VALUE'
```

And you can get a variable value with
```
function variable_va; = 'modules/core/lib/queries/variable/get', name: 'VARIABLE_NAME'
```
You can pass `type` argument that can be array, integer, float, boolean or object.

## Module registry

You can register your module or theme by implementing `hook_module_info` under `partials/lib/hook/`. An info file should seems likes this:
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
function modules = 'modules/core/lib/queries/registry/get, type: 'module`
function themes = 'modules/core/lib/queries/registry/get, type: 'theme`
function all = 'modules/core/lib/queries/registry/get
```

## Helpers
You can check if a module or theme is installed to the project:
```
function exists = 'modules/core/lib/queries/module/exists', type: 'module'
```
