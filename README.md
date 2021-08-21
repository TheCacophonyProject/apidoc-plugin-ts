# apidoc-plugin-ts

A plugin for [apidoc](https://www.npmjs.com/package/apidoc) that injects `@apiSuccess` `@apiParam` params from TypeScript interfaces.
Supports extended and nested interfaces.

## Getting started

```javascript
npm install --save-dev apidoc @cutls/apidoc-plugin-ts
```

```javascript
yarn add -D apidoc @cutls/apidoc-plugin-ts
```

A custom api-doc param `@apiInterface` is exposed:

```javascript
@apiInterface (optional path to definitions file) {INTERFACE_NAME} // @apiSuccess
@apiInterface (optional path to definitions file) ++{INTERFACE_NAME} // @apiParam
 ```

## Example

Given the following interface:

```javascript
// filename: ./employers.ts

export interface Employer {
  /**
   * Employer job title
   */
  jobTitle: string
  /**
   * Employer personal details
   */
  personalDetails: {
    name: string // Their name
    age: number
  }

  note?: string // Note about them(optional)
}

export interface RequestEmployer {
  id: string // ID of the employer
}
```

and the following custom param:

```javascript
@apiInterface (./employers.ts) {Employer}
@apiInterface (./employers.ts) ++{RequestEmployer}
```

under the hood this would transpile to:

```javascript
@apiSuccess {String} jobTitle Job title
@apiSuccess {Object} personalDetails Empoyer personal details
@apiSuccess {String} personalDetails.name Their name
@apiSuccess {Number} personalDetails.age
@apiSuccess {String} [note] Note about them(optional)

@apiParam {String} id ID of the employer
```

*Note if the `Employer` interface is defined in the same file then you can drop the path:*

```javascript
@apiInterface {Employer}
```

## Why `@cutls/apidoc-plugin-ts` ?

### question token support

```javascript
interface {
  optional?: boolean
}
```

APIDoc shows the `optional` budge if attribute are surrounded by `[]`

### `@apiParam` support

Your nice complex request also can be defined with nice TypeScript interface!

### short comment description at the same line support

OK on all ts plugins
```javascript
interface RETURNS {
  /**
   * Their name
   */
  name: string
}
```

cutls plugin also supports

```javascript
interface RETURNS {
  name: string // Their name
}
```