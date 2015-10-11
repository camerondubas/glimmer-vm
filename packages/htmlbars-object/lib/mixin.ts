import { Meta, ComputedReferenceBlueprint, setProperty } from 'htmlbars-reference';
import { InternedString, Dict, dict, intern, assign } from 'htmlbars-util';
import HTMLBarsObject, {
  EMPTY_CACHE,
  HTMLBarsObjectFactory,
  ClassMeta,
  InstanceMeta,
  turbocharge
} from './object';

import {
  ComputedDescriptor,
  ComputedGetCallback,
  LegacyComputedGetCallback,
  ComputedSetCallback,
  LegacyComputedSetCallback
} from './computed';

export const DESCRIPTOR = "5d90f84f-908e-4a42-9749-3d0f523c262c";
export const BLUEPRINT  = "8d97cf5f-db9e-48d8-a6b2-7a75b7170805";

export abstract class Descriptor {
  "5d90f84f-908e-4a42-9749-3d0f523c262c" = true;
  abstract define(prototype: Object, key: InternedString, home: Object);
}

export abstract class Blueprint {
  "8d97cf5f-db9e-48d8-a6b2-7a75b7170805" = true;
  abstract descriptor(target: Object, key: InternedString, classMeta: ClassMeta): Descriptor;
}

export class Mixin {
  private extensions = dict<Blueprint>();
  private concatenatedProperties: InternedString[] = [];
  private wasApplied = false;

  constructor(extensions: Object) {
    this.reopen(extensions);
  }

  reopen(extensions: Object) {
    if ('concatenatedProperties' in extensions) {
      (<any>extensions).concatenatedProperties.forEach(prop => {
        this.concatenatedProperties = (<any>extensions).concatenatedProperties.slice();
      });

      delete (<any>extensions).concatenatedProperties;
    }

    let normalized: Dict<Blueprint> = Object.keys(extensions).reduce((obj, key) => {
      let value = extensions[key];

      switch (typeof value) {
        case 'function':
          obj[key] = new MethodBlueprint({ value });
          break;
        case 'object':
          if (BLUEPRINT in value) obj[key] = value; break;
          /* falls through */
        default:
          obj[key] = new DataBlueprint({ value });
      }

      return obj;
    }, dict<Blueprint>());

    assign(this.extensions, turbocharge(normalized));
  }

  extendPrototype(Original: HTMLBarsObjectFactory<any>) {
    Original.prototype = Object.create(Original.prototype);
    this.extendPrototypeOnto(Original, Original)
  }

  extendPrototypeOnto(Subclass: HTMLBarsObjectFactory<any>, Parent: HTMLBarsObjectFactory<any>) {
    this.mergeProperties(Subclass.prototype, Parent.prototype, Subclass._Meta);
    Subclass._Meta.addMixin(this);
  }

  extendStatic(Target: HTMLBarsObjectFactory<any>) {
    this.mergeProperties(Target, Object.getPrototypeOf(Target), Target._Meta._Meta);
    Target._Meta.addStaticMixin(this);
  }

  mergeProperties(target: Object, parent: Object, meta: ClassMeta) {
    this.concatenatedProperties.forEach(k => meta.addConcatenatedProperty(k, []));

    Object.keys(this.extensions).forEach(key => {
      let extension: Blueprint = this.extensions[key];
      let desc = extension.descriptor(target, <InternedString>key, meta);
      desc.define(target, <InternedString>key, parent);
    });
  }
}

type Extension = Mixin | Object;

export function extend<T extends HTMLBarsObject>(Parent: HTMLBarsObjectFactory<T>, ...extensions: Extension[]): typeof HTMLBarsObject {
  let Super = <typeof HTMLBarsObject>Parent;

  let Subclass = class extends Super {};
  Subclass._Meta = InstanceMeta.fromParent(Parent._Meta);

  let mixins = extensions.map(toMixin);
  Parent._Meta.addSubclass(Subclass);
  mixins.forEach(m => Subclass._Meta.addMixin(m));

  ClassMeta.applyAllMixins(Subclass, Parent);

  return Subclass;
}

export function relinkSubclasses(Parent: HTMLBarsObjectFactory<any>) {
  Parent._Meta.getSubclasses().forEach((Subclass: HTMLBarsObjectFactory<any>) => {
    Subclass._Meta.reset(Parent._Meta);
    Subclass.prototype = Object.create(Parent.prototype);

    ClassMeta.applyAllMixins(Subclass, Parent);

    // recurse into sub-subclasses
    relinkSubclasses(Subclass);
  });
}

export function toMixin(extension: Extension): Mixin {
  if (extension instanceof Mixin) return extension;
  else return new Mixin(extension);
}

class ValueDescriptor extends Descriptor {
  public enumerable: boolean;
  public configurable: boolean;
  public writable: boolean;
  public value: any;

  constructor({ enumerable, configurable, writable, value }: PropertyDescriptor) {
    super();
    this.enumerable = enumerable;
    this.configurable = configurable;
    this.writable = writable;
    this.value = value;
  }

  define(target: Object, key: InternedString, home: Object) {
    Object.defineProperty(target, key, {
      enumerable: this.enumerable,
      configurable: this.configurable,
      writable: this.writable,
      value: this.value
    });
  }
}

class AccessorDescriptor extends Descriptor {
  public enumerable: boolean;
  public configurable: boolean;
  public get: () => any;
  public set: (value: any) => void;

  constructor({ enumerable, configurable, get, set }: PropertyDescriptor) {
    super();
    this.enumerable = enumerable;
    this.configurable = configurable;
    this.get = get;
    this.set = set;
  }

  define(target: Object, key: InternedString, home: Object) {
    Object.defineProperty(target, key, {
      enumerable: this.enumerable,
      configurable: this.configurable,
      get: this.get,
      set: this.set
    });
  }
}

export class DataBlueprint extends Blueprint {
  public enumerable: boolean;
  public configurable: boolean;
  public value: any;
  public writable: boolean;

  constructor({ enumerable=true, configurable=true, writable=true, value }: PropertyDescriptor) {
    super();
    this.enumerable = enumerable;
    this.configurable = configurable;
    this.value = value;
    this.writable = writable;
  }

  descriptor(target: Object, key: InternedString, classMeta: ClassMeta): ValueDescriptor {
    let { enumerable, configurable, writable, value } = this;

    if (classMeta.hasConcatenatedProperty(<InternedString>key)) {
      classMeta.addConcatenatedProperty(<InternedString>key, value);
      value = classMeta.getConcatenatedProperty(<InternedString>key);
    }

    return new ValueDescriptor({ enumerable, configurable, writable, value });
  }
}

export abstract class AccessorBlueprint extends Blueprint {
  public enumerable: boolean;
  public configurable: boolean;
  get: () => any;
  set: (value: any) => void;

  constructor({ enumerable=true, configurable=true, get, set }: PropertyDescriptor) {
    super();
    this.enumerable = enumerable;
    this.configurable = configurable;
    this.get = get;
    this.set = set;
  }

  descriptor(target: Object, key: InternedString, classMeta: ClassMeta): Descriptor {
    return new ValueDescriptor({
      enumerable: this.enumerable,
      configurable: this.configurable,
      get: this.get,
      set: this.set
    })
  }
}

class MethodBlueprint extends DataBlueprint {
  descriptor(target: Object, key: InternedString, classMeta: ClassMeta): ValueDescriptor {
    let home = Object.getPrototypeOf(target);
    let value = wrapMethod(home, <InternedString>key, this.value);

    let desc = super.descriptor(target, key, classMeta);
    desc.value = value;
    return desc;
  }
}

export function wrapMethod(home: Object, methodName: InternedString, original: (...args) => any) {
  if (!(<string>methodName in home)) return original;

  return function(...args) {
    let lastSuper = this._super;
    this._super = home[<string>methodName];

    try {
      return original.apply(this, args);
    } finally {
      this._super = lastSuper;
    }
  }
}