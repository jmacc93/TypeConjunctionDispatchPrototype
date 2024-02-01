
const print = console.log

function echo(x) { print(x); return x}


function stringSplice(str, start, delCount, newSub) {
  return str.slice(0, start) + newSub + str.slice(start + delCount)
}

// -----------------------------


// matches eg: "asdf123_zxcv"
const idRf = `[a-zA-Z_][a-zA-Z0-9_]*` // identifier regex fragment

// matches eg: "guard someName(varName)"
const guardRegex = new RegExp([
  String.raw`(?<=^|[\s;])`,              // must be either whitespace or start of string just before
  String.raw`guard`,                     // keyword
  String.raw`\s+`,                       // must have whitespace after guard
  String.raw`(?<type>${idRf})`,          // type is any regular identifier word
  String.raw`\(\s*(?<arg>${idRf})\s*\)`, // the argument identifier "(varName)"
].join(''))

export function replaceAllGuardForms(source) {
  const guardRegistry = new Set()
  let ret = source
  while(true) {
    // look for guard forms
    const match = guardRegex.exec(ret)
    if(match == undefined)
      break
    const {type, arg, body} = match.groups
    // register the type
    guardRegistry.add(type)
    // replace guard in ret with function
    const matchLength = match[0].length
    ret = stringSplice(ret, match.index, matchLength,
      `function _guardTest_${type}(${arg})`
    )
  }
  return [ret, guardRegistry]
}

// matches eg: "function foo(x: Integer, y, ...)"
const functionDefRegex = new RegExp([
  String.raw`(?<=^|[\s;])`,           // must be either whitespace or start of string just before
  String.raw`function`,               // function
  String.raw`\s+`,                    // must have whitespace after function
  String.raw`(?<name>${idRf})`,       // the function's name
  String.raw`\s*\((?<args>[^\)]*)\)`, // argument block
].join(''))

export function replaceAllFunctionForms(source) {
  // note: a bug due to replacement without updating searchRegex.lastIndex is possible but unseen
  const functionRegistry = {}
  const searchRegex = new RegExp(functionDefRegex, 'g')
  let ret = source
  while(true) {
    // look for definitions
    const match = searchRegex.exec(ret)
    if(match == undefined)
      break
    const {name, args} = match.groups
    
    // don't apply to guard test functions
    if(name.startsWith('_guardTest_'))
      continue
    
    // find guard types in args
    const argNames = []
    const defObj = {argTypesLists:[]}
    for(const argDef of args.split(/\s*,\s*/)) { // split by ','
      const colonSplit = argDef.split(/\s*:\s*/) // split by ':'
      argNames.push(colonSplit[0])
      const types = colonSplit.length == 2 ? colonSplit[1].split(/\s*\*\s/) : [] // split by '*'
      defObj.argTypesLists.push(types)
    }
    
    // register the function
    let registration = functionRegistry[name]
    if(registration == undefined) {
      registration = []
      functionRegistry[name] = registration
    }
    registration.push(defObj)
    
    // mangle function name in ret
    defObj.mangledName = `${name}_${defObj.argTypesLists.flat().join('_')}`
    const matchLength = match[0].length
    ret = stringSplice(ret, match.index, matchLength,
      `function ${defObj.mangledName}(${argNames.join(', ')})`
    )
  }
  return [ret, functionRegistry]
}


export function isRegularFunctionDefObjList(defObjList) {
  return defObjList.length === 1
  && defObjList[0].argTypesLists.length === 1
  && defObjList[0].argTypesLists[0].length === 0
}

export function makeGuardedIfElseStatementsString(name, guardRegistry, defObjList) {
  // defObjList like [{argTypesLists: [['A', 'B'], ['C', 'D']], mangledName: '...'}, ...]
  // is one object for each function definition for `name`
  return defObjList.map((defObj, i) => {
    // defObj like {argTypesLists: [['A', 'B'], ['C', 'D']], mangledName: '...'}
    const {argTypesLists, mangledName} = defObj
    const head = (i === 0 ? '  if' : '  else if')
    const conditionParts = []
    for(const [argI, argTypes] of argTypesLists.entries()) {
      // argTypes like ['Q', 'W']
      // corresponds to conjunction like `Q * W` from original definition in func
      // we're turning it into like: _guardTest_Q(arguments[argI]) && ...
      for(const t of argTypes) {
        // if no guard test for this type, just ignore it
        if(guardRegistry.has(t))
          conditionParts.push(`_guardTest_${t}(arguments[${argI}])`)
      }
    }
    const condition = conditionParts.join(' && ')
    const newCall = `return ${mangledName}(...arguments)`
    return `${head}(${condition})\n    ${newCall}`
  }).join('\n') + `\n  else\n    throw Error('No guards passed for ${name} call')`
}

export function addGuardBranchFunctions(source, guardRegistry, functionRegistry) {
  return source + '\n' + Object.entries(functionRegistry).map(([name, defObjs]) => {
    let body
    if(isRegularFunctionDefObjList(defObjs))
      body = `  return ${name}_(...arguments)`
    else
      body = makeGuardedIfElseStatementsString(name, guardRegistry, defObjs)
    return `function ${name}(){\n${body}\n}`
  }).join('\n')
}


export function convert(source) {
  const [guardRepSource, guardRegistry] = replaceAllGuardForms(source)
  const [funcRepSource, functionRegistry] = replaceAllFunctionForms(guardRepSource)
  return addGuardBranchFunctions(funcRepSource, guardRegistry, functionRegistry)
}

export function run(source) {
  eval(convert(source))
}




