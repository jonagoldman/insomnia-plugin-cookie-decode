const { buildQueryStringFromParams, joinUrlAndQueryString, smartEncodeUrl } = require('insomnia-url');
const { jarFromCookies } = require('insomnia-cookies');

module.exports.templateTags = [
  {
    name: 'cookieDecode',
    displayName: 'Cookie Decode',
    description: 'Decode cookie value from the cookie jar or the current request',
    args: [
      {
        type: 'boolean',
        displayName: 'From Cookie Jar',
        defaultValue: true,
      },
      {
        type: 'string',
        displayName: 'Cookie Name',
      },
      {
        type: 'string',
        displayName: 'Cookie Url',
        hide: args => !args[0].value,
      },
    ],

    async run(context, fromJar, name, url) {
      const { meta } = context;

      if (!meta.requestId || !meta.workspaceId) {
        return null;
      }

      // if (!name) {
      //   throw new Error('No cookie name specified');
      // }

      const workspace = await context.util.models.workspace.getById(meta.workspaceId);

      if (!workspace) {
        throw new Error(`Workspace not found for ${meta.workspaceId}`);
      }

      const cookieJar = await context.util.models.cookieJar.getOrCreateForWorkspace(workspace);

      if (!fromJar) {
        const request = await context.util.models.request.getById(meta.requestId);

        if (!request) {
          throw new Error(`Request not found for ${meta.requestId}`);
        }

        url = await getRequestUrl(context, request);
      }

      return getCookieValue(cookieJar, url, name);
    },
  },
];

async function getRequestUrl(context, request) {
  const url = await context.util.render(request.url);
  const parameters = [];
  for (const p of request.parameters) {
    parameters.push({
      name: await context.util.render(p.name),
      value: await context.util.render(p.value),
    });
  }

  const qs = buildQueryStringFromParams(parameters);
  const finalUrl = joinUrlAndQueryString(url, qs);

  return smartEncodeUrl(finalUrl, request.settingEncodeUrl);
}

function getCookieValue(cookieJar, url, name) {
  return new Promise((resolve, reject) => {
    const jar = jarFromCookies(cookieJar.cookies);

    jar.getCookies(url, {}, (err, cookies) => {
      if (err) {
        console.warn(`Failed to find cookie for ${url}`, err);
      }

      if (!cookies || cookies.length === 0) {
        reject(new Error(`No cookies in store for url "${url}"`));
      }

      const cookie = cookies.find(cookie => cookie.key === name);
      if (!cookie) {
        const names = cookies.map(c => `"${c.key}"`).join(',\n\t');
        throw new Error(
          `No cookie with name "${name}".\nChoices are [\n\t${names}\n] for url "${url}"`,
        );
      } else {
        resolve(cookie ? decodeURIComponent(cookie.value) : null);
      }
    });
  });
}