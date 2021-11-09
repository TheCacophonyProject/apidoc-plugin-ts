"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = exports.APIDOC_PLUGIN_TS_CUSTOM_ELEMENT_NAME = void 0;
var path = require("path");
var fs = require("fs");
var ts_morph_1 = require("ts-morph");
exports.APIDOC_PLUGIN_TS_CUSTOM_ELEMENT_NAME = 'apiinterface';
var definitionFilesAddedByUser = {};
var Apidoc;
(function (Apidoc) {
    var AvailableHook;
    (function (AvailableHook) {
        AvailableHook["parser-find-elements"] = "parser-find-elements";
    })(AvailableHook = Apidoc.AvailableHook || (Apidoc.AvailableHook = {}));
})(Apidoc || (Apidoc = {}));
var ast;
function init(app) {
    app.addHook(Apidoc.AvailableHook['parser-find-elements'], parseElements.bind(app), 200);
}
exports.init = init;
function getTsConfigRelativeTo(filename) {
    var filePath = path.resolve(path.dirname(filename));
    while (filePath) {
        var tsConfig = filePath + "/tsconfig.json";
        if (fs.existsSync(tsConfig)) {
            return tsConfig;
        }
        filePath = path.resolve(filePath, '../');
    }
    return '';
}
function parseElements(elements, element, block, filename) {
    if (!ast) {
        ast = new ts_morph_1.Project({
            tsConfigFilePath: getTsConfigRelativeTo(filename),
            addFilesFromTsConfig: false
        });
    }
    if (element.name !== exports.APIDOC_PLUGIN_TS_CUSTOM_ELEMENT_NAME)
        return;
    elements.pop();
    var newElements = [];
    var values = parse(element.content);
    if (!values) {
        this.log.warn("Could not find parse values of element: " + element.content);
        return;
    }
    var namedInterface = values.interface.trim();
    var interfacePath = values.path ? path.resolve(path.dirname(filename), values.path.trim()) : filename;
    var parentNamespace = parseDefinitionFiles.call(this, interfacePath);
    var _a = extractNamespace.call(this, parentNamespace, namedInterface), namespace = _a.namespace, leafName = _a.leafName;
    if (isNativeType(leafName)) {
        parseNative(elements, newElements, interfacePath, values);
        return;
    }
    var arrayMatch = matchArrayInterface(leafName);
    if (arrayMatch) {
        parseArray.call(this, elements, newElements, values, interfacePath, namespace, arrayMatch);
        return;
    }
    if (parseInterface.call(this, elements, newElements, values, interfacePath, namespace, leafName) === false) {
        var interfacePath_1 = resolvePathAlias(parentNamespace, namedInterface, filename);
        if (interfacePath_1) {
            var parentNamespace_1 = parseDefinitionFiles.call(this, interfacePath_1);
            var _b = extractNamespace.call(this, parentNamespace_1, namedInterface), namespace_1 = _b.namespace, leafName_1 = _b.leafName;
            parseInterface.call(this, elements, newElements, values, interfacePath_1, namespace_1, leafName_1);
        }
    }
}
function resolvePathAlias(parentNamespace, namedInterface, filename) {
    if (parentNamespace) {
        var p = parentNamespace;
        var symbolsAndModules = p
            .getImportDeclarations()
            .map(function (v) { return [v.getImportClause(), v.getModuleSpecifier()]; })
            .filter(function (v) { return v[0] !== undefined; })
            .map(function (v) { return [v[0].getNamedImports().map(function (i) { return i.getSymbol(); }), v[1]]; });
        for (var _i = 0, symbolsAndModules_1 = symbolsAndModules; _i < symbolsAndModules_1.length; _i++) {
            var _a = symbolsAndModules_1[_i], symbols = _a[0], module_1 = _a[1];
            if (Array.isArray(symbols)) {
                var names = symbols.map(function (i) { return i.getEscapedName().trim(); });
                if (names) {
                    var found = names.includes(namedInterface);
                    if (found) {
                        var moduleAliasPath = module_1.getText().replace(/\"/g, '');
                        if (moduleAliasPath.startsWith('@')) {
                            var aliasParts = moduleAliasPath.split('/');
                            var aliasStart = aliasParts.shift();
                            var aliasEnd = aliasParts.join('/');
                            var pathAliases = ast.getCompilerOptions().paths;
                            if (pathAliases) {
                                var fullResolvedPath = '';
                                for (var _b = 0, _c = Object.entries(pathAliases); _b < _c.length; _b++) {
                                    var _d = _c[_b], alias = _d[0], resolved = _d[1];
                                    if (alias.startsWith(aliasStart) && alias.endsWith('*')) {
                                        var rootPath = getTsConfigRelativeTo(filename).replace('tsconfig.json', '');
                                        var resolvedPath = "" + rootPath + resolved[0].replace('*', aliasEnd);
                                        if (fs.existsSync(resolvedPath)) {
                                            fullResolvedPath = resolvedPath;
                                        }
                                        else if (fs.existsSync(resolvedPath + ".d.ts")) {
                                            fullResolvedPath = resolvedPath + ".d.ts";
                                        }
                                        else if (fs.existsSync(resolvedPath + ".ts")) {
                                            fullResolvedPath = resolvedPath + ".ts";
                                        }
                                        if (fullResolvedPath !== '') {
                                            return path.resolve(fullResolvedPath);
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
function parseNative(elements, newElements, interfacePath, values) {
    setNativeElements(interfacePath, newElements, values);
    elements.push.apply(elements, newElements);
}
function parseArray(elements, newElements, values, interfacePath, namespace, arrayMatch) {
    var leafName = arrayMatch.interface;
    var matchedInterface = getNamespacedInterface(namespace, leafName);
    if (!matchedInterface) {
        this.log.warn("Could not find interface \u00AB" + leafName + "\u00BB in file \u00AB" + interfacePath + "\u00BB in namespace " + namespace);
        return;
    }
    setArrayElements.call(this, matchedInterface, interfacePath, newElements, values);
    elements.push.apply(elements, newElements);
}
function parseInterface(elements, newElements, values, interfacePath, namespace, leafName) {
    var matchedInterface = getNamespacedInterface(namespace, leafName);
    if (!matchedInterface) {
        return false;
    }
    setInterfaceElements.call(this, matchedInterface, interfacePath, newElements, values);
    elements.push.apply(elements, newElements);
}
var ApiElement;
(function (ApiElement) {
    ApiElement["ApiSuccess"] = "apiSuccess";
    ApiElement["ApiBody"] = "apiBody";
    ApiElement["ApiParam"] = "apiParam";
    ApiElement["ApiQuery"] = "apiQuery";
    ApiElement["ApiError"] = "apiError";
})(ApiElement || (ApiElement = {}));
var PropType;
(function (PropType) {
    PropType["Enum"] = "Enum";
    PropType["Array"] = "Array";
    PropType["Object"] = "Object";
    PropType["Native"] = "Native";
})(PropType || (PropType = {}));
function parse(content) {
    if (content.length === 0)
        return null;
    var parseRegExp = /^(?:\((.+?)\)){0,1}\s*(\+\+)?\{(.+?)\}\s*(?:\[(.+?)\]){0,1}\s*(?:(.+))?/g;
    var matches = parseRegExp.exec(content);
    if (!matches)
        return null;
    var interfaceDef = matches[3];
    var apiElement = 'apiSuccess';
    if (interfaceDef.includes('::')) {
        interfaceDef = interfaceDef.split('::')[1];
        apiElement = matches[3].split('::')[0];
    }
    if (!Object.values(ApiElement).includes(apiElement)) {
        console.log.apply(console, __spreadArray(['Parse error - expected one of'], Object.values(ApiElement), false));
        return null;
    }
    return {
        element: apiElement,
        interface: interfaceDef,
        path: matches[1],
        nest: matches[4]
    };
}
function setArrayElements(matchedInterface, filename, newElements, values, inttype) {
    var name = values.element;
    newElements.push(getApiElement("{Object[]} " + name + " " + name, values.element));
    setInterfaceElements.call(this, matchedInterface, filename, newElements, values, name);
}
function setInterfaceElements(matchedInterface, filename, newElements, values, inttype) {
    var _this = this;
    extendInterface.call(this, matchedInterface, filename, newElements, values, inttype);
    matchedInterface.getProperties().forEach(function (prop) {
        var isOptional = prop.getStructure().hasQuestionToken;
        var typeDef = inttype ? inttype + "." + prop.getName() : prop.getName();
        var largeComment = prop.getJsDocs().map(function (node) { return node.getInnerText(); }).join();
        var shortComment = prop.getTrailingCommentRanges().map(function (node) { return node.getText().replace(/^\/\/\s*/, '').replace(/^\/\*.+\*\\\s*$/, ''); }).join();
        var documentationComments = shortComment ? shortComment : largeComment;
        var description = documentationComments
            ? "`" + typeDef + "` - " + documentationComments
            : "`" + typeDef + "`";
        var propTypeName = prop.getType().getText();
        var typeEnum = getPropTypeEnum(prop);
        var propLabel = getPropLabel(prop, typeEnum, propTypeName);
        var typeDefNested = values.nest ? values.nest + "." + typeDef : typeDef;
        newElements.push(getApiElement("{" + propLabel + "} " + (isOptional ? '[' : '') + typeDefNested + (isOptional ? ']' : '') + " " + description, values.element));
        if ([PropType.Object, PropType.Array].includes(typeEnum)) {
            var typeInterface = getInterface.call(_this, filename, propTypeName);
            var arrayType = typeEnum === PropType.Array && prop.getType().getArrayElementType();
            var objectProperties = arrayType
                ? arrayType.getProperties()
                : prop.getType().getProperties();
            if (typeInterface) {
                setInterfaceElements.call(_this, typeInterface, filename, newElements, values, typeDef);
            }
            else {
                setObjectElements.call(_this, objectProperties, filename, newElements, values, typeDef);
            }
        }
    });
}
function setNativeElements(filename, newElements, values) {
    var propLabel = getCapitalized(values.interface);
    newElements.push(getApiElement("{" + propLabel + "} " + values.element, values.element));
    return;
}
function setObjectElements(properties, filename, newElements, values, typeDef) {
    var _this = this;
    properties.forEach(function (property) {
        var _a, _b;
        var valueDeclaration = property.getValueDeclaration();
        if (!valueDeclaration)
            return;
        var text = valueDeclaration.getText().replace(' ', '');
        var isOptional = text.match(/^["'a-z_A-Z0-9]+\s*\?\s*:/);
        var propName = property.getName();
        var typeDefLabel = typeDef + "." + propName;
        var propType = valueDeclaration.getType().getText(valueDeclaration);
        var declarationFile = (_b = (_a = property.compilerSymbol.valueDeclaration) === null || _a === void 0 ? void 0 : _a.parent) === null || _b === void 0 ? void 0 : _b.getSourceFile();
        var isUserDefinedProperty = declarationFile && definitionFilesAddedByUser[declarationFile.fileName] || false;
        if (!isUserDefinedProperty)
            return;
        var largeComment = '';
        try {
            largeComment = property.compilerSymbol.getDocumentationComment(undefined).map(function (node) { return node.text; }).join();
        }
        catch (e) {
            largeComment = '';
        }
        var shortComment = valueDeclaration.getTrailingCommentRanges().map(function (node) { return node.getText().replace(/^\/\/\s*/, '').replace(/^\/\*.+\*\\\s*$/, ''); }).join();
        var documentationComments = shortComment ? shortComment : largeComment;
        var desc = documentationComments
            ? "`" + typeDef + "." + propName + "` - " + documentationComments
            : "`" + typeDef + "." + propName + "`";
        if (isNativeType(propType)) {
            var el = getApiElement("{" + getCapitalized(propType) + "} " + (isOptional ? '[' : '') + typeDefLabel + (isOptional ? ']' : '') + " " + desc, values.element);
            newElements.push(el);
            return;
        }
        var isEnum = valueDeclaration.getType().isEnum();
        if (isEnum) {
            newElements.push(getApiElement("{Enum} " + (isOptional ? '[' : '') + typeDefLabel + (isOptional ? ']' : '') + " " + desc, values.element));
            return;
        }
        var newElement = getApiElement("{Object" + (propType.includes('[]') ? '[]' : '') + "} " + (isOptional ? '[' : '') + typeDefLabel + (isOptional ? ']' : '') + " " + desc, values.element);
        newElements.push(newElement);
        var typeInterface = getInterface.call(_this, filename, propType);
        if (typeInterface) {
            setInterfaceElements.call(_this, typeInterface, filename, newElements, values, typeDefLabel);
        }
        else {
            var externalFileTypeSymbol = valueDeclaration.getType().getSymbol();
            if (!externalFileTypeSymbol) {
                setObjectElements.call(_this, property.getValueDeclarationOrThrow().getType().getProperties(), filename, newElements, values, typeDef);
                return;
            }
            var externalFileDeclaration = externalFileTypeSymbol.getDeclarations()[0];
            var externalFileInterface = externalFileDeclaration.getSourceFile().getInterface(propType);
            if (!externalFileInterface) {
                setObjectElements.call(_this, property.getValueDeclarationOrThrow().getType().getProperties(), filename, newElements, values, typeDefLabel);
                return;
            }
            setObjectElements.call(_this, externalFileInterface.getType().getProperties(), filename, newElements, values, typeDefLabel);
        }
    });
}
function extendInterface(matchedInterface, interfacePath, newElements, values, inttype) {
    for (var _i = 0, _a = matchedInterface.getExtends(); _i < _a.length; _i++) {
        var extendedInterface = _a[_i];
        var extendedInterfaceName = extendedInterface.compilerNode.expression.getText();
        var parentNamespace = matchedInterface.getParentNamespace() || parseDefinitionFiles.call(this, interfacePath);
        var _b = extractNamespace.call(this, parentNamespace, extendedInterfaceName), namespace = _b.namespace, leafName = _b.leafName;
        var matchedExtendedInterface = getNamespacedInterface.call(this, namespace, leafName);
        if (!matchedExtendedInterface) {
            this.log.warn("Could not find interface to be extended " + extendedInterfaceName);
            return;
        }
        extendInterface.call(this, matchedExtendedInterface, interfacePath, newElements, values);
        setInterfaceElements.call(this, matchedExtendedInterface, interfacePath, newElements, values, inttype);
    }
}
function getApiElement(param, element) {
    return {
        content: param + "\n",
        name: element.toLowerCase(),
        source: "@" + element + " " + param + "\n",
        sourceName: element
    };
}
function parseDefinitionFiles(interfacePath) {
    var interfaceFile = ast.addExistingSourceFile(interfacePath);
    if (!interfaceFile)
        return;
    trackUserAddedDefinitionFile(interfaceFile);
    for (var _i = 0, _a = ast.resolveSourceFileDependencies(); _i < _a.length; _i++) {
        var file = _a[_i];
        trackUserAddedDefinitionFile(file);
    }
    return interfaceFile;
}
function extractNamespace(rootNamespace, interfaceName) {
    var _this = this;
    var isNamespaced = interfaceName.match(/(?:[a-zA-Z0-9_]\.)*[a-zA-Z0-9_]\./i);
    var nameSegments = isNamespaced
        ? interfaceName.replace('[]', '').split('.')
        : [interfaceName];
    var namespaces = nameSegments.slice(0, -1);
    var leafName = nameSegments[nameSegments.length - 1];
    var namespace = namespaces.reduce(function (parent, name) {
        if (!parent)
            return;
        var namespace = parent.getNamespace(name);
        if (!namespace)
            _this.log.warn("Could not find namespace " + name + " in root namespace in file at " + rootNamespace.getSourceFile().getFilePath());
        return namespace;
    }, rootNamespace);
    return {
        namespace: namespace,
        leafName: leafName
    };
}
function getNamespacedInterface(namespace, interfaceName) {
    return namespace.getInterface(interfaceName);
}
function getInterface(interfacePath, interfaceName) {
    var interfaceFile = parseDefinitionFiles(interfacePath);
    var _a = extractNamespace.call(this, interfaceFile, interfaceName), namespace = _a.namespace, leafName = _a.leafName;
    return getNamespacedInterface.call(this, namespace, leafName);
}
function trackUserAddedDefinitionFile(file) {
    definitionFilesAddedByUser[file.getFilePath()] = true;
}
function getCapitalized(text) {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
function isNativeType(propType) {
    var nativeTypes = ['boolean', 'Boolean', 'string', 'String', 'number', 'Number', 'Date', 'any'];
    return nativeTypes.indexOf(propType) >= 0;
}
function getPropTypeEnum(prop) {
    var propType = prop.getType().getText();
    var propTypeIsEnum = prop.getType().isEnum() || prop.getType().isEnumLiteral();
    var propTypeIsObject = !propTypeIsEnum && !isNativeType(propType);
    var propTypeIsArray = propTypeIsObject && propType.includes('[]');
    if (propTypeIsArray)
        return PropType.Array;
    if (propTypeIsObject)
        return PropType.Object;
    if (propTypeIsEnum)
        return PropType.Enum;
    return PropType.Native;
}
function getPropLabel(prop, typeEnum, propTypeName) {
    if (typeEnum === PropType.Array)
        return 'Object[]';
    if (typeEnum === PropType.Object)
        return 'Object';
    if (typeEnum === PropType.Enum) {
        var variants_1 = [];
        var allStrings_1 = true;
        var allNumbers_1 = true;
        for (var _i = 0, _a = prop.getType().getSymbol().getDeclarations(); _i < _a.length; _i++) {
            var node = _a[_i];
            node.forEachChild(function (node) {
                node.forEachChild(function (node) {
                    if (node.getKindName() === 'StringLiteral') {
                        allNumbers_1 = false;
                        variants_1.push(node.getText());
                    }
                    else if (node.getKindName() === 'NumericLiteral') {
                        console.log(node.getKindName());
                        allStrings_1 = false;
                        variants_1.push(node.getText());
                    }
                });
            });
        }
        if (allStrings_1) {
            return "String=" + variants_1.join(',');
        }
        else if (allNumbers_1) {
            return "Number=" + variants_1.join(',');
        }
        return 'Enum';
    }
    return getCapitalized(propTypeName);
}
function matchArrayInterface(interfaceName) {
    var match = interfaceName.match(/^Array<(.*)>$/) || interfaceName.match(/^(.*)\[\]$/);
    if (!match) {
        return null;
    }
    return {
        full: interfaceName,
        interface: match[1]
    };
}
