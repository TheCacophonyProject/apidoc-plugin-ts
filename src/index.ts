import * as ts from 'typescript'
import * as path from 'path'
import * as fs from 'fs'
import {
  ImportClause,
  InterfaceDeclaration,
  NamespaceDeclaration,
  Project as Ast,
  PropertySignature,
  SourceFile, StringLiteral,
  Symbol
} from 'ts-morph'

export const APIDOC_PLUGIN_TS_CUSTOM_ELEMENT_NAME = 'apiinterface'

const definitionFilesAddedByUser: { [key: string]: boolean } = {}

namespace Apidoc {
  export enum AvailableHook {
    'parser-find-elements' = 'parser-find-elements'
  }

  export interface App {
    addHook (name: AvailableHook, func: Function, priority?: number)
  }

  export interface Element {
    source: string
    name: string
    sourceName: string
    content: string
  }

  export type ParserFindElementsHookCallback = (
    elements: Element[],
    element: Element,
    block: string,
    filename: string
  ) => void
}

let ast: Ast

/**
 * Initialise plugin (add app hooks)
 * @param app
 */
export function init (app: Apidoc.App) {
  app.addHook(Apidoc.AvailableHook['parser-find-elements'], parseElements.bind(app), 200)
}

function getTsConfigRelativeTo (filename: string): string {
  let filePath = path.resolve(path.dirname(filename))
  while (filePath) {
    let tsConfig = `${filePath}/tsconfig.json`
    if (fs.existsSync(tsConfig)) {
      return tsConfig
    }
    filePath = path.resolve(filePath, '../')
  }
  return ''
}

/**
 * Parse elements
 * @param elements
 * @param element
 * @param block
 * @param filename
 */
function parseElements (elements: Apidoc.Element[], element: Apidoc.Element, block: string, filename: string) {
  if (!ast) {
    // Initialise the AST, finding the nearest tsconfig.json file to `filename`
    ast = new Ast({
      tsConfigFilePath: getTsConfigRelativeTo(filename),
      addFilesFromTsConfig: false
    })
  }

  // We only want to do things with the instance of our custom element.
  if (element.name !== APIDOC_PLUGIN_TS_CUSTOM_ELEMENT_NAME) return

  // Remove the element
  elements.pop()

  // Create array of new elements
  const newElements: Apidoc.Element[] = []

  // Get object values
  const values = parse(element.content)

  // Only if there are values...
  if (!values) {
    this.log.warn(`Could not find parse values of element: ${element.content}`)
    return
  }

  // The interface we are looking for
  const namedInterface = values.interface.trim()
  // Get the file path to the interface
  const interfacePath = values.path ? path.resolve(path.dirname(filename), values.path.trim()) : filename

  const parentNamespace = parseDefinitionFiles.call(this, interfacePath)
  const { namespace, leafName } = extractNamespace.call(this, parentNamespace, namedInterface)

  if (isNativeType(leafName)) {
    parseNative(elements, newElements, interfacePath, values)
    return
  }
  const arrayMatch = matchArrayInterface(leafName)
  if (arrayMatch) {
    parseArray.call(this, elements, newElements, values, interfacePath, namespace, arrayMatch)
    return
  }

  if (parseInterface.call(this, elements, newElements, values, interfacePath, namespace, leafName) === false) {
    const interfacePath = resolvePathAlias(parentNamespace, namedInterface, filename)
    if (interfacePath) {
      const parentNamespace = parseDefinitionFiles.call(this, interfacePath)
      const { namespace, leafName } = extractNamespace.call(this, parentNamespace, namedInterface)
      parseInterface.call(this, elements, newElements, values, interfacePath, namespace, leafName)
    }
  }
  // Does the interface exist in current file?
}

function resolvePathAlias (parentNamespace, namedInterface, filename) {
  if (parentNamespace) {
    const p = (parentNamespace as SourceFile)
    const symbolsAndModules = p
      .getImportDeclarations()
      .map(v => [v.getImportClause(), v.getModuleSpecifier()])
      .filter(v => v[0] !== undefined)
      .map(v => [(v[0] as ImportClause).getNamedImports().map(i => i.getSymbol()), v[1]])
    for (const [symbols, module] of symbolsAndModules) {
      if (Array.isArray(symbols)) {
        const names = symbols.map(i => (i as unknown as Symbol).getEscapedName().trim())
        if (names) {
          const found = (names as unknown[] as string[]).includes(namedInterface)
          if (found) {
            const moduleAliasPath = (module as StringLiteral).getText().replace(/\"/g, '')
            if (moduleAliasPath.startsWith('@')) {
              const aliasParts = moduleAliasPath.split('/')
              const aliasStart = aliasParts.shift() as string
              const aliasEnd = aliasParts.join('/')
              const pathAliases = ast.getCompilerOptions().paths
              if (pathAliases) {
                let fullResolvedPath = ''
                for (const [alias, resolved] of Object.entries(pathAliases)) {
                  if (alias.startsWith(aliasStart) && alias.endsWith('*')) {
                    const rootPath = getTsConfigRelativeTo(filename).replace('tsconfig.json', '')
                    const resolvedPath = `${rootPath}${resolved[0].replace('*', aliasEnd)}`
                    if (fs.existsSync(resolvedPath)) {
                      fullResolvedPath = resolvedPath
                    } else if (fs.existsSync(`${resolvedPath}.d.ts`)) {
                      fullResolvedPath = `${resolvedPath}.d.ts`
                    } else if (fs.existsSync(`${resolvedPath}.ts`)) {
                      fullResolvedPath = `${resolvedPath}.ts`
                    }
                    if (fullResolvedPath !== '') {
                      return path.resolve(fullResolvedPath)
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

function parseNative (elements: Apidoc.Element[], newElements: Apidoc.Element[], interfacePath: string, values: ParseResult) {
  setNativeElements(interfacePath, newElements, values)
  elements.push(...newElements)

}

function parseArray (elements: Apidoc.Element[], newElements: Apidoc.Element[], values: ParseResult, interfacePath: string, namespace: NamespaceDeclaration, arrayMatch: ArrayMatch) {
  const leafName = arrayMatch.interface
  const matchedInterface = getNamespacedInterface(namespace, leafName)
  if (!matchedInterface) {
    this.log.warn(`Could not find interface «${leafName}» in file «${interfacePath}» in namespace ${namespace}`)
    return
  }
  setArrayElements.call(this, matchedInterface, interfacePath, newElements, values)
  elements.push(...newElements)

}

function parseInterface (elements: Apidoc.Element[], newElements: Apidoc.Element[], values: ParseResult, interfacePath: string, namespace: NamespaceDeclaration, leafName: string) {
  const matchedInterface = getNamespacedInterface(namespace, leafName)

  // If interface is not found, log error
  if (!matchedInterface) {
    //this.log.warn(`!! Could not find interface «${values.interface}» in file «${interfacePath}»`)
    return false
  }

  // Match elements of current interface
  setInterfaceElements.call(this, matchedInterface, interfacePath, newElements, values)

  // Push new elements into existing elements
  elements.push(...newElements)
}

enum ApiElement {
  ApiSuccess = 'apiSuccess',
  ApiBody = 'apiBody',
  ApiParam = 'apiParam',
  ApiQuery = 'apiQuery',
  ApiError = 'apiError'
}

interface ParseResult {
  element: ApiElement
  interface: string
  path: string
  nest?: string
}

interface ArrayMatch {
  full: string
  interface: string
}

enum PropType {
  Enum = 'Enum',
  Array = 'Array',
  Object = 'Object',
  Native = 'Native'
}

/**
 * Parse element content
 * @param content
 */
function parse (content: string): ParseResult | null {
  if (content.length === 0) return null

  const parseRegExp = /^(?:\((.+?)\)){0,1}\s*(\+\+)?\{(.+?)\}\s*(?:\[(.+?)\]){0,1}\s*(?:(.+))?/g
  const matches = parseRegExp.exec(content)

  if (!matches) return null
  let interfaceDef = matches[3]
  let apiElement = 'apiSuccess'
  if (interfaceDef.includes('::')) {
    interfaceDef = interfaceDef.split('::')[1]
    apiElement = matches[3].split('::')[0]
  }
  if (!(Object.values(ApiElement) as string[]).includes(apiElement)) {
    console.log('Parse error - expected one of', ...Object.values(ApiElement))
    return null
  }
  return {
    element: apiElement as ApiElement,
    interface: interfaceDef,
    path: matches[1],
    nest: matches[4]
  }
}

/**
 *
 * @param matchedInterface
 * @param filename
 * @param newElements
 * @param values
 * @param inttype
 */
function setArrayElements (
  matchedInterface: InterfaceDeclaration,
  filename: string,
  newElements: Apidoc.Element[],
  values: ParseResult,
  inttype?: string
) {
  const name = values.element
  newElements.push(getApiElement(`{Object[]} ${name} ${name}`, values.element))
  setInterfaceElements.call(this, matchedInterface, filename, newElements, values, name)
}
/**
 *
 * @param matchedInterface
 * @param filename
 * @param newElements
 * @param values
 * @param inttype
 */
function setInterfaceElements (
  matchedInterface: InterfaceDeclaration,
  filename: string,
  newElements: Apidoc.Element[],
  values: ParseResult,
  inttype?: string
) {
  // If this is an extended interface
  extendInterface.call(this, matchedInterface, filename, newElements, values, inttype)
  // Iterate over interface properties
  matchedInterface.getProperties().forEach((prop: PropertySignature) => {
    // Set param type definition and description
    const isOptional = prop.getStructure().hasQuestionToken

    const typeDef = inttype ? `${inttype}.${prop.getName()}` : prop.getName()
    const largeComment = prop.getJsDocs().map((node) => node.getInnerText()).join()
    const shortComment = prop.getTrailingCommentRanges().map((node) => node.getText().replace(/^\/\/\s*/, '').replace(/^\/\*.+\*\\\s*$/, '')).join()
    const documentationComments = shortComment ? shortComment : largeComment
    const description = documentationComments
      ? `\`${typeDef}\` - ${documentationComments}`
      : `\`${typeDef}\``

    // Set property type as a string
    const propTypeName = prop.getType().getText()
    const typeEnum = getPropTypeEnum(prop)

    const propLabel = getPropLabel(prop, typeEnum, propTypeName)
    const typeDefNested = values.nest ? `${values.nest}.${typeDef}` : typeDef
    // Set the element
    newElements.push(getApiElement(`{${propLabel}} ${isOptional ? '[' : ''}${typeDefNested}${isOptional ? ']' : ''} ${description}`, values.element))

    // If property is an object or interface then we need to also display the objects properties
    if ([PropType.Object, PropType.Array].includes(typeEnum)) {
      // First determine if the object is an available interface
      // console.log(typeEnum, propTypeName, typeDefNested)
      // console.log(propLabel)
      const typeInterface = getInterface.call(this, filename, propTypeName)
      const arrayType = typeEnum === PropType.Array && prop.getType().getArrayElementType()
      const objectProperties = arrayType
        ? arrayType.getProperties()
        : prop.getType().getProperties()

      if (typeInterface) {
        setInterfaceElements.call(this, typeInterface, filename, newElements, values, typeDef)
      } else {
        // console.log('setObjectElements', objectProperties, filename, newElements, values, typeDef)
        setObjectElements.call(this, objectProperties, filename, newElements, values, typeDef)
      }
    }
  })
}

/**
 *
 * @param filename
 * @param newElements
 * @param values
 */
function setNativeElements (
  filename: string,
  newElements: Apidoc.Element[],
  values: ParseResult
  // inttype?: string
) {

  const propLabel = getCapitalized(values.interface)
  // Set the element
  newElements.push(getApiElement(`{${propLabel}} ${values.element}`, values.element))
  return
}

/**
 * Set element if type object
 */
function setObjectElements<NodeType extends ts.Node = ts.Node> (
  properties: Symbol[],
  filename: string,
  newElements: Apidoc.Element[],
  values: ParseResult,
  typeDef: string
) {
  properties.forEach((property) => {
    const valueDeclaration = property.getValueDeclaration()
    if (!valueDeclaration) return
    const text = valueDeclaration.getText().replace(' ', '')
    const isOptional = text.match(/^["'a-z_A-Z0-9]+\s*\?\s*:/)
    const propName = property.getName()
    const typeDefLabel = `${typeDef}.${propName}`
    const propType = valueDeclaration.getType().getText(valueDeclaration)
    const declarationFile = property.compilerSymbol.valueDeclaration?.parent?.getSourceFile()
    const isUserDefinedProperty = declarationFile && definitionFilesAddedByUser[declarationFile.fileName] || false
    if (!isUserDefinedProperty) return // We don't want to include default members in the docs
    let largeComment = ''
    try {
      largeComment = property.compilerSymbol.getDocumentationComment(undefined).map((node) => node.text).join()
    } catch (e) {
      largeComment = ''
    }
    const shortComment = valueDeclaration.getTrailingCommentRanges().map((node) => node.getText().replace(/^\/\/\s*/, '').replace(/^\/\*.+\*\\\s*$/, '')).join()
    const documentationComments = shortComment ? shortComment : largeComment
    const desc = documentationComments
      ? `\`${typeDef}.${propName}\` - ${documentationComments}`
      : `\`${typeDef}.${propName}\``

    // Nothing to do if prop is of native type
    if (isNativeType(propType)) {
      const el = getApiElement(`{${getCapitalized(propType)}} ${isOptional ? '[' : ''}${typeDefLabel}${isOptional ? ']' : ''} ${desc}`, values.element)
      newElements.push(el)
      return
    }
    const isEnum = valueDeclaration.getType().isEnum()
    if (isEnum) {
      newElements.push(getApiElement(`{Enum} ${isOptional ? '[' : ''}${typeDefLabel}${isOptional ? ']' : ''} ${desc}`, values.element))
      return
    }

    const newElement = getApiElement(`{Object${propType.includes('[]') ? '[]' : ''}} ${isOptional ? '[' : ''}${typeDefLabel}${isOptional ? ']' : ''} ${desc}`, values.element)
    newElements.push(newElement)

    // If property is an object or interface then we need to also display the objects properties
    const typeInterface = getInterface.call(this, filename, propType)

    if (typeInterface) {
      setInterfaceElements.call(this, typeInterface, filename, newElements, values, typeDefLabel)
    } else {

      const externalFileTypeSymbol = valueDeclaration.getType().getSymbol()
      if (!externalFileTypeSymbol) {
        setObjectElements.call(
          this,
          property.getValueDeclarationOrThrow().getType().getProperties(),
          filename,
          newElements,
          values,
          typeDef
        )
        return
      }

      const externalFileDeclaration = externalFileTypeSymbol.getDeclarations()[0]
      const externalFileInterface = externalFileDeclaration.getSourceFile().getInterface(propType)

      if (!externalFileInterface) {
        setObjectElements.call(
          this,
          property.getValueDeclarationOrThrow().getType().getProperties(),
          filename,
          newElements,
          values,
          typeDefLabel
        )
        return
      }

      setObjectElements.call(
        this,
        externalFileInterface.getType().getProperties(),
        filename,
        newElements,
        values,
        typeDefLabel
      )
    }
  })
}

/**
 * Extends the current interface
 * @param matchedInterface
 * @param interfacePath
 * @param newElements
 * @param values
 */
function extendInterface (
  matchedInterface: InterfaceDeclaration,
  interfacePath: string,
  newElements: Apidoc.Element[],
  values: ParseResult,
  inttype?: string
) {
  for (const extendedInterface of matchedInterface.getExtends()) {
    const extendedInterfaceName = extendedInterface.compilerNode.expression.getText()
    const parentNamespace = matchedInterface.getParentNamespace() || parseDefinitionFiles.call(this, interfacePath)
    const { namespace, leafName } = extractNamespace.call(this, parentNamespace, extendedInterfaceName)
    const matchedExtendedInterface = getNamespacedInterface.call(this, namespace, leafName)
    if (!matchedExtendedInterface) {
      this.log.warn(`Could not find interface to be extended ${extendedInterfaceName}`)
      return
    }

    extendInterface.call(this, matchedExtendedInterface, interfacePath, newElements, values)
    setInterfaceElements.call(this, matchedExtendedInterface, interfacePath, newElements, values, inttype)
  }
}

function getApiElement (param: string | number, element: ApiElement): Apidoc.Element {
  return {
    content: `${param}\n`,
    name: element.toLowerCase(),
    source: `@${element} ${param}\n`,
    sourceName: element
  }
}

type NamespacedContext = SourceFile | NamespaceDeclaration
interface NamespacedDeclaration {
  declaration: InterfaceDeclaration
  parentNamespace: NamespacedContext
}

function parseDefinitionFiles (interfacePath: string): SourceFile | undefined {
  const interfaceFile = ast.addExistingSourceFile(interfacePath)
  if (!interfaceFile) return

  trackUserAddedDefinitionFile(interfaceFile)
  for (const file of ast.resolveSourceFileDependencies()) {
    trackUserAddedDefinitionFile(file)
  }
  return interfaceFile
}

function extractNamespace (
  rootNamespace: NamespacedContext,
  interfaceName: string
): { namespace: NamespaceDeclaration | undefined; leafName: string; } {
  const isNamespaced = interfaceName.match(/(?:[a-zA-Z0-9_]\.)*[a-zA-Z0-9_]\./i)

  const nameSegments = isNamespaced
    ? interfaceName.replace('[]', '').split('.')
    : [interfaceName]

  const namespaces = nameSegments.slice(0, -1)
  const leafName = nameSegments[nameSegments.length - 1]

  const namespace = namespaces.reduce(
    (parent: NamespacedContext | undefined, name: string) => {
      if (!parent) return
      const namespace = parent.getNamespace(name)
      if (!namespace) this.log.warn(`Could not find namespace ${name} in root namespace in file at ${rootNamespace.getSourceFile().getFilePath()}`)
      return namespace
    },
    rootNamespace
  ) as NamespaceDeclaration | undefined
  return {
    namespace,
    leafName
  }
}

function getNamespacedInterface (
  namespace: NamespaceDeclaration,
  interfaceName: string
): InterfaceDeclaration | undefined {
  return namespace.getInterface(interfaceName)
}
function getInterface (interfacePath: string, interfaceName: string): InterfaceDeclaration | undefined {
  const interfaceFile = parseDefinitionFiles(interfacePath)
  const { namespace, leafName } = extractNamespace.call(this, interfaceFile, interfaceName)
  return getNamespacedInterface.call(this, namespace, leafName)
}

function trackUserAddedDefinitionFile (file: SourceFile) {
  definitionFilesAddedByUser[file.getFilePath()] = true
}

function getCapitalized (text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

function isNativeType (propType: string): boolean {
  const nativeTypes = ['boolean', 'Boolean', 'string', 'String', 'number', 'Number', 'Date', 'any']
  return nativeTypes.indexOf(propType) >= 0
}

function getPropTypeEnum (prop: PropertySignature): PropType {
  const propType = prop.getType().getText()
  const propTypeIsEnum = prop.getType().isEnum() || prop.getType().isEnumLiteral()
  const propTypeIsObject = !propTypeIsEnum && !isNativeType(propType)
  const propTypeIsArray = propTypeIsObject && propType.includes('[]')

  if (propTypeIsArray) return PropType.Array
  if (propTypeIsObject) return PropType.Object
  if (propTypeIsEnum) return PropType.Enum
  return PropType.Native
}

function getPropLabel (prop: PropertySignature, typeEnum: PropType, propTypeName: string): string {
  if (typeEnum === PropType.Array) return 'Object[]'
  if (typeEnum === PropType.Object) return 'Object'
  if (typeEnum === PropType.Enum) {
    // If it's an enum, return the variants:
    const variants: string[] = []
    let allStrings = true
    let allNumbers = true
    for (const node of prop.getType().getSymbol()!.getDeclarations()) {
      node.forEachChild((node) => {
        node.forEachChild((node) => {
          if (node.getKindName() === 'StringLiteral') {
            allNumbers = false
            variants.push(node.getText())
          } else if (node.getKindName() === 'NumericLiteral') {
            console.log(node.getKindName())
            allStrings = false
            variants.push(node.getText())
          }
        })
      })
    }
    if (allStrings) {
      return `String=${variants.join(',')}`
    } else if (allNumbers) {
      return `Number=${variants.join(',')}`
    }
    return 'Enum'
  }

  return getCapitalized(propTypeName)
}

function matchArrayInterface (interfaceName): ArrayMatch | null {
  const match = interfaceName.match(/^Array<(.*)>$/) || interfaceName.match(/^(.*)\[\]$/)
  if (!match) {
    return null
  }
  return {
    full: interfaceName,
    interface: match[1]
  }
}
