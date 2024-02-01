
import {
  replaceAllGuardForms, replaceAllFunctionForms,
  makeGuardedIfElseStatementsString, addGuardBranchFunctions,
  convert, run
} from './tagJsConverter.mjs'


const print = console.log

function equals(objA, objB) {
  if(objA === objB)
    return true
  
  const typeA = typeof objA
  if(typeA !== typeof objB)
    return false
  
  if(typeA === 'object') {
    // array
    if(Array.isArray(objA)) {
      if(!Array.isArray(objB)  ||  (objA.length !== objB.length))
        return false
      for(let i = 0; i < objA.length; i++) {
        if(!equals(objA[i], objB[i]))
          return false
      }
      return true
    } else { // a generic object
      for(const key in objA) {
        if(!(key in objB)  ||  !equals(objA[key], objB[key]))
          return false
      }
      for(const key in objB) {
        if(!(key in objA)  ||  !equals(objA[key], objB[key]))
          return false
      }
      return true
    }
  }
  return false
}

function assert(x, msg) {
  if(!x)
    throw Error(msg ?? `Assertion error`)
}
function assertEquals(a, b, msg) {
  if(!equals(a, b)) {
    if(msg == undefined)
      throw Error(`assertEquals failed\na = ${a}\nb = ${b}`)
    else
      throw Error(msg + `\na = ${a}\nb = ${b}`)
  }
}

const tests = []
function addTest(name, func) {
  tests.push({name: name, func: func})
}
function runTests() {
  let failedCount = 0
  for(const t of tests) {
    try {
      t.func()
    } catch(err) {
      print(`Test failed: "${t.name}"\n${err.stack}`)
      failedCount++
    }
  }
  if(failedCount > 0)
    print(`${failedCount} tests failed`)
}

// -------------------

addTest('replaceAllGuardForms', () => {
  const testSource = `
  guard Positive(x) {
    return x > 0
  }
  guard Integer(x) {
    return typeof x === 'number'  &&  x == Math.round(x)
  }
  guard String(x) {
    return typeof x === 'string'
  }

  function foo(x: Integer * Positive, y: Integer, z) {
    print("_Integer_Positive_Integer", x, y, z)
  }
  function foo(x: String) {
    print("_String", x)
  }

  foo(123, 456, "zxcv")
  foo("asdf")`
  const [result, guardRegistry] = replaceAllGuardForms(testSource)
  assert(guardRegistry.has('Positive'))
  assert(guardRegistry.has('Integer'))
  assert(guardRegistry.has('String'))
  assertEquals(guardRegistry.size, 3)
  assertEquals(result, `
  function _guardTest_Positive(x) {
    return x > 0
  }
  function _guardTest_Integer(x) {
    return typeof x === 'number'  &&  x == Math.round(x)
  }
  function _guardTest_String(x) {
    return typeof x === 'string'
  }

  function foo(x: Integer * Positive, y: Integer, z) {
    print("_Integer_Positive_Integer", x, y, z)
  }
  function foo(x: String) {
    print("_String", x)
  }

  foo(123, 456, "zxcv")
  foo("asdf")`)
})

addTest('replaceAllFunctionForms', () => {
  const testSource = `
  guard Positive(x) {
    return x > 0
  }
  guard Integer(x) {
    return typeof x === 'number'  &&  x == Math.round(x)
  }
  guard String(x) {
    return typeof x === 'string'
  }

  function foo(x: Integer * Positive, y: Integer, z) {
    print("_Integer_Positive_Integer", x, y, z)
  }
  function foo(x: String) {
    print("_String", x)
  }

  foo(123, 456, "zxcv")
  foo("asdf")`
  let [curSource, guardRegistry] = replaceAllGuardForms(testSource)
  const [result, functionRegistry] = replaceAllFunctionForms(curSource)
  assertEquals(functionRegistry, {"foo":[{"argTypesLists":[["Integer","Positive"],["Integer"],[]],"mangledName":"foo_Integer_Positive_Integer"},{"argTypesLists":[["String"]],"mangledName":"foo_String"}]})
  assertEquals(result, `
  function _guardTest_Positive(x) {
    return x > 0
  }
  function _guardTest_Integer(x) {
    return typeof x === 'number'  &&  x == Math.round(x)
  }
  function _guardTest_String(x) {
    return typeof x === 'string'
  }

  function foo_Integer_Positive_Integer(x, y, z) {
    print("_Integer_Positive_Integer", x, y, z)
  }
  function foo_String(x) {
    print("_String", x)
  }

  foo(123, 456, "zxcv")
  foo("asdf")`)
})

addTest('makeGuardedIfElseStatementsString', () => {
  const guardRegistry = new Set(['X1', 'X2', 'Y1', 'Y2']) // omit X3
  const result = makeGuardedIfElseStatementsString('foo', guardRegistry, [
    {argTypesLists: [['X1', 'X2'], ['Y1']], mangledName: 'foo_1'},
    {argTypesLists: [['X3'], ['Y2']], mangledName: 'foo_2'}
  ])
  assertEquals(result, `  if(_guardTest_X1(arguments[0]) && _guardTest_X2(arguments[0]) && _guardTest_Y1(arguments[1]))
    return foo_1(...arguments)
  else if(_guardTest_Y2(arguments[1]))
    return foo_2(...arguments)
  else
    throw Error('No guards passed for foo call')`)
})

addTest('addGuardBranchFunctions', () => {
  const testSource = `
  guard Positive(x) {
    return x > 0
  }
  guard Integer(x) {
    return typeof x === 'number'  &&  x == Math.round(x)
  }
  guard String(x) {
    return typeof x === 'string'
  }

  function foo(x: Integer * Positive, y: Integer, z) {
    print("_Integer_Positive_Integer", x, y, z)
  }
  function foo(x: String) {
    print("_String", x)
  }

  foo(123, 456, "zxcv")
  foo("asdf")`
  const [guardRepSource, guardRegistry] = replaceAllGuardForms(testSource)
  const [funcRepSource, functionRegistry] = replaceAllFunctionForms(guardRepSource)
  const finalSource = addGuardBranchFunctions(funcRepSource, guardRegistry, functionRegistry)
  assertEquals(finalSource, `
  function _guardTest_Positive(x) {
    return x > 0
  }
  function _guardTest_Integer(x) {
    return typeof x === 'number'  &&  x == Math.round(x)
  }
  function _guardTest_String(x) {
    return typeof x === 'string'
  }

  function foo_Integer_Positive_Integer(x, y, z) {
    print("_Integer_Positive_Integer", x, y, z)
  }
  function foo_String(x) {
    print("_String", x)
  }

  foo(123, 456, "zxcv")
  foo("asdf")
function foo(){
  if(_guardTest_Integer(arguments[0]) && _guardTest_Positive(arguments[0]) && _guardTest_Integer(arguments[1]))
    return foo_Integer_Positive_Integer(...arguments)
  else if(_guardTest_String(arguments[0]))
    return foo_String(...arguments)
  else
    throw Error('No guards passed for foo call')
}`)
  
})

addTest('convert, run', () => {
  run(`
  guard Even(x) { return x % 2 == 0 }
  guard Odd(x) { return x % 2 == 1 }

  function foo(x: Even) { return x / 2 }
  function foo(x: Odd) { return x + 1 }

  const res = foo(foo(foo(foo(10))))
  if(res != 4)
    throw Error('Test failed')`)
})

// -------------------

runTests()
print('DONE')
