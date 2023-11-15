import { pathToFileURL } from 'node:url'
import { readPackageJSON, resolvePackageJSON } from 'pkg-types'
import { type Nuxt } from '@nuxt/schema'
import { importModule, tryImportModule } from '../internal/esm'
import { type LoadNuxtConfigOptions } from './config'

export interface LoadNuxtOptions extends LoadNuxtConfigOptions {
  /** Load nuxt with development mode */
  dev?: boolean

  /** Use lazy initialization of nuxt if set to false */
  ready?: boolean

  /** @deprecated Use cwd option */
  rootDir?: LoadNuxtConfigOptions['cwd']

  /** @deprecated use overrides option */
  config?: LoadNuxtConfigOptions['overrides']
}

export async function loadNuxt(options: LoadNuxtOptions): Promise<Nuxt> {
  // Backward compatibility
  options.cwd = options.cwd || options.rootDir

  options.overrides = options.overrides || options.config || {}

  // Apply dev as config override
  options.overrides.dev = !!options.dev

  const nearestNuxtPackage = await Promise.all(['nuxt-nightly', 'nuxt3', 'nuxt', 'nuxt-edge']
    .map(
      (package__) => resolvePackageJSON(
        package__, { url: options.cwd }
      ).catch(() => {}))
  )
    .then(
      (r) => (
        r.filter(Boolean) as string[]
      ).sort((a, b) => b.length - a.length)[0]
    )

  if (!nearestNuxtPackage) {
    throw new Error(`Cannot find any nuxt version from ${options.cwd}`)
  }

  const package_ = await readPackageJSON(nearestNuxtPackage)
  const majorVersion = Number.parseInt((package_.version || '').split('.')[0])

  const rootDirectory = pathToFileURL(options.cwd || process.cwd()).href

  // Nuxt 3
  if (majorVersion === 3) {
    // eslint-disable-next-line ts/no-unsafe-assignment
    const { loadNuxt } = await importModule(
      // eslint-disable-next-line style/max-len
      // eslint-disable-next-line ts/no-unsafe-argument, ts/no-unsafe-member-access, ts/no-explicit-any
      (package_ as any)._name || package_.name, rootDirectory
    )

    // eslint-disable-next-line ts/no-unsafe-call, ts/no-unsafe-assignment
    const nuxt = await loadNuxt(options)

    // eslint-disable-next-line ts/no-unsafe-return
    return nuxt
  }

  // Nuxt 2
  // eslint-disable-next-line ts/no-unsafe-assignment
  const { loadNuxt } = await tryImportModule('nuxt-edge', rootDirectory) || await importModule('nuxt', rootDirectory)

  // eslint-disable-next-line ts/no-unsafe-assignment, ts/no-unsafe-call
  const nuxt = await loadNuxt({
    rootDir: options.cwd,
    for: options.dev ? 'dev' : 'build',
    configOverrides: options.overrides,
    ready: options.ready,
    envConfig: options.dotenv // TODO: Backward format conversion
  })

  // Mock new hookable methods
  // eslint-disable-next-line ts/no-unsafe-member-access, ts/no-unsafe-call
  nuxt.removeHook ||= nuxt.clearHook.bind(nuxt)

  // eslint-disable-next-line ts/no-unsafe-member-access, ts/no-unsafe-call
  nuxt.removeAllHooks ||= nuxt.clearHooks.bind(nuxt)

  // eslint-disable-next-line ts/no-unsafe-member-access
  nuxt.hookOnce ||= (
    name: string,
    // eslint-disable-next-line ts/no-explicit-any
    function_: (...arguments_: any[]) => any, ...hookArguments: any[]
  ) => {
    // eslint-disable-next-line style/max-len
    // eslint-disable-next-line ts/no-unsafe-assignment, ts/no-unsafe-member-access, ts/no-unsafe-call, ts/no-explicit-any
    const unsub = nuxt.hook(name, (...arguments_: any[]) => {
      // eslint-disable-next-line ts/no-unsafe-call
      unsub()

      // eslint-disable-next-line ts/no-unsafe-return, ts/no-unsafe-argument
      return function_(...arguments_)
    }, ...hookArguments)

    // eslint-disable-next-line ts/no-unsafe-return
    return unsub
  }

  // eslint-disable-next-line style/max-len
  // https://github.com/nuxt/nuxt/tree/main/packages/kit/src/module/define.ts#L111-L113
  // eslint-disable-next-line ts/no-unsafe-member-access
  nuxt.hooks ||= nuxt

  return nuxt as Nuxt
}

// eslint-disable-next-line ts/no-explicit-any
export async function buildNuxt(nuxt: Nuxt): Promise<any> {
  const rootDirectory = pathToFileURL(nuxt.options.rootDir).href

  // Nuxt 3
  if (nuxt.options._majorVersion === 3) {
    // eslint-disable-next-line ts/no-unsafe-assignment
    const { build } = await tryImportModule('nuxt-nightly', rootDirectory)
      || await tryImportModule('nuxt3', rootDirectory)
      || await importModule('nuxt', rootDirectory)

    // eslint-disable-next-line ts/no-unsafe-return, ts/no-unsafe-call
    return build(nuxt)
  }

  // Nuxt 2
  // eslint-disable-next-line ts/no-unsafe-assignment
  const { build } = await tryImportModule('nuxt-edge', rootDirectory)
    || await importModule('nuxt', rootDirectory)

  // eslint-disable-next-line ts/no-unsafe-return, ts/no-unsafe-call
  return build(nuxt)
}
