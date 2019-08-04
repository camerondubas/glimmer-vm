import {
  Reference,
  ReferenceCache,
  Revision,
  Tag,
  VersionedReference,
  isConst,
  isConstTag,
  value,
  validate,
} from '@glimmer/reference';
import { Opaque, Option } from '@glimmer/util';
import {
  expectStackChange,
  check,
  CheckString,
  CheckElement,
  CheckNode,
  CheckOption,
  CheckInstanceof,
} from '@glimmer/debug';
import { Simple, FIXME } from '@glimmer/interfaces';
import { Op, Register } from '@glimmer/vm';
import {
  ModifierDefinition,
  InternalModifierManager,
  ModifierInstanceState,
  ModifierManager,
} from '../../modifier/interfaces';
import { APPEND_OPCODES, UpdatingOpcode } from '../../opcodes';
import { UpdatingVM } from '../../vm';
import { Assert } from './vm';
import { DynamicAttribute } from '../../vm/attributes/dynamic';
import { ComponentElementOperations } from './component';
import { CheckReference, CheckArguments } from './-debug-strip';
import { expect } from '@glimmer/util';

APPEND_OPCODES.add(Op.Text, (vm, { op1: text }) => {
  vm.elements().appendText(vm.constants.getString(text));
});

APPEND_OPCODES.add(Op.Comment, (vm, { op1: text }) => {
  vm.elements().appendComment(vm.constants.getString(text));
});

APPEND_OPCODES.add(Op.OpenElement, (vm, { op1: tag }) => {
  vm.elements().openElement(vm.constants.getString(tag));
});

APPEND_OPCODES.add(Op.OpenDynamicElement, vm => {
  let tagName = check(check(vm.stack.pop(), CheckReference).value(), CheckString);
  vm.elements().openElement(tagName);
});

APPEND_OPCODES.add(Op.PushRemoteElement, vm => {
  let elementRef = check(vm.stack.pop(), CheckReference);
  let nextSiblingRef = check(vm.stack.pop(), CheckReference);
  let guidRef = check(vm.stack.pop(), CheckReference);

  let element: Simple.Element;
  let nextSibling: Option<Simple.Node>;
  let guid = guidRef.value() as string;

  if (isConst(elementRef)) {
    element = check(elementRef.value(), CheckElement);
  } else {
    let cache = new ReferenceCache(elementRef as Reference<Simple.Element>);
    element = check(cache.peek(), CheckElement);
    vm.updateWith(new Assert(cache));
  }

  if (isConst(nextSiblingRef)) {
    nextSibling = check(nextSiblingRef.value(), CheckOption(CheckNode));
  } else {
    let cache = new ReferenceCache(nextSiblingRef as Reference<Option<Simple.Node>>);
    nextSibling = check(cache.peek(), CheckOption(CheckNode));
    vm.updateWith(new Assert(cache));
  }

  vm.elements().pushRemoteElement(element, guid, nextSibling);
});

APPEND_OPCODES.add(Op.PopRemoteElement, vm => {
  vm.elements().popRemoteElement();
});

APPEND_OPCODES.add(Op.FlushElement, vm => {
  let operations = check(
    vm.fetchValue(Register.t0),
    CheckOption(CheckInstanceof(ComponentElementOperations))
  );
  let modifiers: Option<[ModifierManager<Opaque, Opaque>, Opaque][]> = null;

  if (operations) {
    modifiers = operations.flush(vm);
    vm.loadValue(Register.t0, null);
  }

  vm.elements().flushElement(modifiers);
});

APPEND_OPCODES.add(Op.CloseElement, vm => {
  let modifiers = vm.elements().closeElement();

  if (modifiers) {
    modifiers.forEach(([manager, modifier]) => {
      vm.env.scheduleInstallModifier(
        modifier as FIXME<ModifierInstanceState, 'unique troubles'>,
        manager as FIXME<ModifierManager<ModifierInstanceState, Opaque>, 'unique troubles'>
      );
      let destructor = manager.getDestructor(modifier);

      if (destructor) {
        vm.newDestroyable(destructor);
      }
    });
  }

  expectStackChange(vm.stack, 0, 'CloseElement');
});

APPEND_OPCODES.add(Op.Modifier, (vm, { op1: handle }) => {
  let { manager, state } = vm.constants.resolveHandle<ModifierDefinition>(handle);
  let stack = vm.stack;
  let args = check(stack.pop(), CheckArguments);
  let { constructing, updateOperations } = vm.elements();
  let dynamicScope = vm.dynamicScope();
  let modifier = manager.create(
    expect(constructing, 'BUG: ElementModifier could not find the element it applies to'),
    state,
    args,
    dynamicScope,
    updateOperations
  );

  let operations = expect(
    check(vm.fetchValue(Register.t0), CheckOption(CheckInstanceof(ComponentElementOperations))),
    'BUG: ElementModifier could not find operations to append to'
  );

  operations.addModifier(manager, modifier);

  let tag = manager.getTag(modifier);

  if (!isConstTag(tag)) {
    vm.updateWith(new UpdateModifierOpcode(tag, manager, modifier));
  }
});

export class UpdateModifierOpcode extends UpdatingOpcode {
  public type = 'update-modifier';
  private lastUpdated: Revision;

  constructor(
    public tag: Tag,
    private manager: InternalModifierManager,
    private modifier: ModifierInstanceState
  ) {
    super();
    this.lastUpdated = value(tag);
  }

  evaluate(vm: UpdatingVM) {
    let { manager, modifier, tag, lastUpdated } = this;

    if (!validate(tag, lastUpdated)) {
      vm.env.scheduleUpdateModifier(modifier, manager);
      this.lastUpdated = value(tag);
    }
  }
}

APPEND_OPCODES.add(Op.StaticAttr, (vm, { op1: _name, op2: _value, op3: _namespace }) => {
  let name = vm.constants.getString(_name);
  let value = vm.constants.getString(_value);
  let namespace = _namespace ? vm.constants.getString(_namespace) : null;

  vm.elements().setStaticAttribute(name, value, namespace);
});

APPEND_OPCODES.add(Op.DynamicAttr, (vm, { op1: _name, op2: trusting, op3: _namespace }) => {
  let name = vm.constants.getString(_name);
  let reference = check(vm.stack.pop(), CheckReference);
  let value = reference.value();
  let namespace = _namespace ? vm.constants.getString(_namespace) : null;

  let attribute = vm.elements().setDynamicAttribute(name, value, !!trusting, namespace);

  if (!isConst(reference)) {
    vm.updateWith(new UpdateDynamicAttributeOpcode(reference, attribute));
  }
});

export class UpdateDynamicAttributeOpcode extends UpdatingOpcode {
  public type = 'patch-element';

  public tag: Tag;
  public lastRevision: number;

  constructor(private reference: VersionedReference<Opaque>, private attribute: DynamicAttribute) {
    super();
    let { tag } = reference;
    this.tag = tag;
    this.lastRevision = value(tag);
  }

  evaluate(vm: UpdatingVM) {
    let { attribute, reference, tag } = this;
    if (!validate(tag, this.lastRevision)) {
      this.lastRevision = value(tag);
      attribute.update(reference.value(), vm.env);
    }
  }
}
