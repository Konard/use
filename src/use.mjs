async (packageIdentifier) => {
  const path = await import('path');
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const { createRequire } = await import('module');
  const require = createRequire(__filename);
  const execAsync = promisify(exec);

  const directoryExists = async (directoryPath) => {
    try {
      const { stat } = await import('fs/promises');
      const stats = await stat(directoryPath);
      return stats.isDirectory();
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      return false;
    }
  };

  const tryResolveModule = async (packagePath) => {
    if (!await directoryExists(packagePath)) {
      return null;
    }
    try {
      return require.resolve(packagePath);
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') {
        throw error;
      }
      return null;
    }
  };

  function parseModuleSpecifier(packageIdentifier) {
    const regex = /^(?<packageName>@?([^@/]+\/)?[^@/]+)?(?:@(?<version>[^/]+))?(?<modulePath>(?:\/[^@]+)*)?$/;
    const match = packageIdentifier.match(regex);
    if (!match || !match.groups.packageName) {
      throw new Error(
        `Failed to parse package identifier '${packageIdentifier}'. Please specify a version (e.g., 'lodash@4.17.21' or '@chakra-ui/react@1.0.0').`
      );
    }
    const { packageName, version = 'latest', modulePath = '' } = match.groups;
    return { packageName, version, modulePath };
  }

  if (!packageIdentifier || typeof packageIdentifier !== 'string' || packageIdentifier.length <= 0) {
    throw new Error(`Name for a package to be installed and imported is not provided. Please specify package name and a version (e.g., 'lodash@4.17.21' or '@chakra-ui/react@1.0.0').`);
  }

  const { packageName, version, modulePath } = parseModuleSpecifier(packageIdentifier);

  // Define the alias for global installation
  const alias = `${packageName.replace('@', '').replace('/', '-')}-v${version}`;

  // Get the global node_modules path
  const { stdout } = await execAsync("npm root -g");
  const globalPath = stdout.trim();

  // Resolve the exact path to the installed package with alias
  const packagePath = path.join(globalPath, alias);

  const packageModulePath = modulePath ? path.join(packagePath, modulePath) : packagePath;
  let resolvedPath = await tryResolveModule(packageModulePath);

  if (version === 'latest' || !resolvedPath) {
    // Install the package globally with the specified version and alias if not installed or it is the latest version
    try {
      await execAsync(`npm install -g ${alias}@npm:${packageName}@${version}`, { stdio: 'ignore' });
      console.log(`${packageName}@${version} installed successfully.`);
    } catch (error) {
      throw new Error(`Failed to install ${packageName}@${version} globally.`, { cause: error });
    }
  }

  resolvedPath = await tryResolveModule(packageModulePath); // Resolve the path after installation
  if (!resolvedPath) {
    throw new Error(`Failed to resolve the path to ${packageName}@${version} from '${packageModulePath}'.`);
  }

  // Dynamically import the package
  try {
    const module = await import(resolvedPath);

    // Check if the only key in the module is "default"
    const keys = Object.keys(module);
    if (keys.length === 1 && keys[0] === 'default') {
      return module.default || module;
    }

    return module;
  } catch (error) {
    throw new Error(`Failed to import ${packageName}@${version} from '${packagePath}' resolved as '${resolvedPath}'.`, { cause: error });
  }
}