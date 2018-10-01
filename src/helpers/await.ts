import { CallExpression, Expression } from 'estree';
import { ExpressionNode, wrapInPromiseAll, wrapInAwait, insertAwaitedValue } from './ast';

function placeVariableClosestBlock(
  node: Expression,
  ancestors: Array<ExpressionNode>,
  variable: string,
  start: number,
) {
  for (let i = start; i--; ) {
    const ancestor = ancestors[i];
    const child = ancestors[i + 1];

    if (ancestor.type === 'BlockStatement') {
      const position = ancestor.body.indexOf(child as any);
      const offset = ancestor.body.length - position;
      insertAwaitedValue(ancestor.body, variable, node, offset);
      break;
    }
  }
}

function placeAsyncLambda(ancestors: Array<ExpressionNode>, variables: Array<string>, start = ancestors.length) {
  for (let i = start; i--; ) {
    const ancestor = ancestors[i];

    if (ancestor.type === 'ArrowFunctionExpression') {
      ancestor.async = true;
      awaitCall(ancestor, ancestors, variables, i);
      break;
    }
  }
}

export function awaitCall(
  node: Expression,
  ancestors: Array<ExpressionNode>,
  variables: Array<string>,
  start = ancestors.length,
) {
  for (let i = start; i--; ) {
    const ancestor = ancestors[i];
    const child = ancestors[i + 1];

    if (node !== ancestor) {
      if (ancestor.type === 'ReturnStatement') {
        ancestor.argument = wrapInAwait(child);
      } else if (ancestor.type === 'Property') {
        ancestor.value = wrapInAwait(child);
      } else if (ancestor.type === 'MemberExpression') {
        const variable = `_${variables.length}`;
        variables.push(variable);
        placeVariableClosestBlock(node, ancestors, variable, i);
        ancestor.object = {
          type: 'Identifier',
          name: variable,
        };
      } else if (ancestor.type === 'CallExpression' && child.type !== 'ArrowFunctionExpression') {
        const argIndex = ancestor.arguments.findIndex(m => m === child);
        ancestor.arguments[argIndex] = wrapInAwait(child);
      } else if (ancestor.type === 'AssignmentExpression') {
        ancestor.right = wrapInAwait(ancestor.right);
      } else if (ancestor.type === 'BinaryExpression') {
        if (ancestor.left === child) {
          ancestor.left = wrapInAwait(child);
        } else {
          ancestor.right = wrapInAwait(child);
        }
      } else if (ancestor.type === 'LogicalExpression') {
        if (ancestor.left === child) {
          ancestor.left = wrapInAwait(child);
        } else {
          ancestor.right = wrapInAwait(child);
        }
      } else if (ancestor.type === 'ConditionalExpression') {
        if (ancestor.consequent === child) {
          ancestor.consequent = wrapInAwait(child);
        } else {
          ancestor.alternate = wrapInAwait(child);
        }
      } else {
        continue;
      }

      placeAsyncLambda(ancestors, variables, i);
      break;
    }
  }
}

export function awaitMap(node: CallExpression, ancestors: Array<ExpressionNode>, variables: Array<string>) {
  const lambda = node.arguments && node.arguments[0];

  if (lambda && lambda.type === 'ArrowFunctionExpression' && lambda.async === true) {
    const previous = ancestors[ancestors.length - 2];

    switch (previous.type) {
      case 'ReturnStatement':
        previous.argument = wrapInPromiseAll(node);
        break;
      case 'MemberExpression':
        previous.object = wrapInPromiseAll(node);
        break;
    }

    awaitCall(node, ancestors, variables);
  }
}