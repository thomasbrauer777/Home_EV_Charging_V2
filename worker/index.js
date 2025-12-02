import { Router } from 'itty-router';

const router = Router();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function corsResponse(response) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

async function supabaseRequest(env, endpoint, method = 'GET', body = null) {
  const url = `${env.SUPABASE_URL}/rest/v1/${endpoint}`;
  const options = {
    method,
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  };
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Supabase request failed');
  }
  return response.json();
}

function createJWT(installationId, rememberMe = false) {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = rememberMe ? (7 * 24 * 60 * 60) : (24 * 60 * 60);
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    installation_id: installationId,
    iat: now,
    exp: now + expiresIn
  }));
  return `${header}.${payload}.UNSIGNED`;
}

router.options('*', () => {
  return new Response(null, { headers: corsHeaders });
});

router.post('/api/auth/login', async (request, env) => {
  try {
    const { installation_id, password, remember_me } = await request.json();
    
    if (!installation_id || !password) {
      return corsResponse(new Response(JSON.stringify({ 
        error: 'Missing credentials' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    const installations = await supabaseRequest(
      env, 
      `installations?installation_id=eq.${installation_id}&select=*`
    );
    
    if (!installations || installations.length === 0) {
      return corsResponse(new Response(JSON.stringify({ 
        error: 'Installation nicht gefunden' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    const installation = installations[0];
    const validPasswords = ['arbon123', 'test123'];
    
    if (!validPasswords.includes(password)) {
      return corsResponse(new Response(JSON.stringify({ 
        error: 'Falsches Passwort' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    const token = createJWT(installation_id, remember_me);
    
    return corsResponse(new Response(JSON.stringify({
      success: true,
      token,
      installation: {
        installation_id: installation.installation_id,
        location: installation.location
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('Login error:', error);
    return corsResponse(new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

router.get('/api/installations/:id/data', async (request, env) => {
  try {
    const { id } = request.params;
    
    const [parties, charges, paymentHistory, settings] = await Promise.all([
      supabaseRequest(env, `parties?installation_id=eq.${id}&order=party_order`),
      supabaseRequest(env, `charges?installation_id=eq.${id}&order=date.desc`),
      supabaseRequest(env, `payment_history?installation_id=eq.${id}&order=payment_date.desc`),
      supabaseRequest(env, `installation_settings?installation_id=eq.${id}`)
    ]);
    
    return corsResponse(new Response(JSON.stringify({
      parties: parties || [],
      charges: charges || [],
      payment_history: paymentHistory || [],
      settings: settings?.[0] || {}
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('Get data error:', error);
    return corsResponse(new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

router.post('/api/installations/:id/mark-paid', async (request, env) => {
  try {
    const { id } = request.params;
    const { total_kwh, total_cost, cost_per_party, charge_count } = await request.json();
    
    await supabaseRequest(env, 'payment_history', 'POST', {
      installation_id: id,
      payment_date: new Date().toISOString(),
      total_kwh,
      total_cost,
      cost_per_party,
      charge_count
    });
    
    await fetch(`${env.SUPABASE_URL}/rest/v1/charges?installation_id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      }
    });
    
    return corsResponse(new Response(JSON.stringify({ 
      success: true 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('Mark paid error:', error);
    return corsResponse(new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
});

router.all('*', () => {
  return corsResponse(new Response(JSON.stringify({ 
    error: 'Not Found' 
  }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  }));
});

export default {
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  }
};
```

6. **Commit changes**

---

## ✅ Nach dem Commit:

Der Workflow deployt automatisch neu!

Warte ~2 Minuten, dann teste nochmal:
```
https://ev-charge-share-worker.thomas-braeuer.workers.dev/api/auth/login
