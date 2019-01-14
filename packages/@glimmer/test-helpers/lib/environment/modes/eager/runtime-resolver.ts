import { ExternalModuleTable, ModuleLocatorMap } from '@glimmer/bundle-compiler';
import {
  ComponentDefinition,
  Invocation,
  ModuleLocator,
  ProgramSymbolTable,
  TemplateMeta,
  RuntimeResolver,
  Template,
} from '@glimmer/interfaces';
import { expect, Option } from '@glimmer/util';
import { WrappedLocator } from '../../component-definition';
import { Modules } from './modules';

export default class EagerRuntimeResolver implements RuntimeResolver {
  constructor(
    private table: ExternalModuleTable,
    private modules: Modules,
    public symbolTables: ModuleLocatorMap<ProgramSymbolTable>
  ) {}

  lookupHelper(_name: string, _meta: unknown): Option<number> {
    throw new Error('Method not implemented.');
  }

  lookupModifier(_name: string, _meta: unknown): Option<number> {
    throw new Error('Method not implemented.');
  }

  lookupComponent(
    name: string,
    referrer: Option<TemplateMeta<WrappedLocator>>
  ): Option<ComponentDefinition> {
    if (referrer === null) return null;

    let moduleName = this.modules.resolve(name, referrer, 'ui/components');

    if (!moduleName) return null;

    let module = this.modules.get(moduleName);
    return module.get('default') as ComponentDefinition;
  }

  lookupPartial(_name: string, _meta: unknown): Option<number> {
    throw new Error('Method not implemented.');
  }

  resolve<U>(handle: number): U {
    let module = this.table.byHandle.get(handle)!;
    return this.modules.get(module.module).get('default') as U;
  }

  getInvocation(locator: TemplateMeta<ModuleLocator>): Invocation {
    let handle = this.getVMHandle(locator);
    let symbolTable = expect(
      this.symbolTables.get(locator),
      `expected symbol table for module ${locator}`
    );

    return {
      handle,
      symbolTable,
    };
  }

  compilable(_locator: TemplateMeta<ModuleLocator>): Template {
    throw new Error(`Unimplemented; AOT#compilable`);
  }

  getVMHandle(locator: ModuleLocator): number {
    let handle = expect(
      this.table.vmHandleByModuleLocator.get(locator),
      `could not find handle for module ${locator}`
    );
    return handle;
  }
}
