const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Пакеты монорепы (@cucoudle/protocol) написаны в NodeNext-стиле:
// относительные импорты указывают на ".js", а на диске лежат ".ts".
// Metro такое не резолвит сам — убираем расширение и пробуем ещё раз.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  try {
    return resolve(context, moduleName, platform);
  } catch (error) {
    if (moduleName.startsWith('.') && /\.[mc]?js$/.test(moduleName)) {
      return resolve(context, moduleName.replace(/\.[mc]?js$/, ''), platform);
    }
    throw error;
  }
};

module.exports = config;
