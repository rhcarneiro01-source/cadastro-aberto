/*!
 * Cadastro Aberto — consulta de CNPJ com dados públicos
 * (c) 2026 Renan Henrique Carneiro — Licença MIT
 */
(() => {
  "use strict";

  // ---------------------------------------------------------------- config
  const PROVEDORES = [
    { nome: "BrasilAPI", url: (c) => `https://brasilapi.com.br/api/cnpj/v1/${c}`, normalizar: deBrasilAPI },
    { nome: "CNPJ.ws", url: (c) => `https://publica.cnpj.ws/cnpj/${c}`, normalizar: deCnpjWs },
  ];
  const TIMEOUT_MS = 15000;
  const HIST_KEY = "cadastroAberto.historico";
  const HIST_MAX = 8;

  const $ = (id) => document.getElementById(id);
  const form = $("form"), input = $("cnpj"), btn = $("btn-buscar");
  let atual = null; // último resultado normalizado

  // ---------------------------------------------------------------- CNPJ
  /** Remove pontuação e deixa em maiúsculas (suporta CNPJ alfanumérico). */
  function limpar(v) { return String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, ""); }

  function mascarar(v) {
    const c = limpar(v).slice(0, 14);
    const p = [c.slice(0, 2), c.slice(2, 5), c.slice(5, 8), c.slice(8, 12), c.slice(12, 14)];
    let out = p[0];
    if (p[1]) out += "." + p[1];
    if (p[2]) out += "." + p[2];
    if (p[3]) out += "/" + p[3];
    if (p[4]) out += "-" + p[4];
    return out;
  }

  /** Valida dígitos verificadores. Letras valem (código ASCII − 48), regra do CNPJ alfanumérico. */
  function valido(c) {
    if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false;
    if (/^(.)\1{13}$/.test(c)) return false;
    const val = (ch) => ch.charCodeAt(0) - 48;
    const dv = (base) => {
      let peso = base.length - 7, soma = 0;
      for (const ch of base) { soma += val(ch) * peso; peso = peso === 2 ? 9 : peso - 1; }
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const d1 = dv(c.slice(0, 12));
    const d2 = dv(c.slice(0, 12) + d1);
    return c.endsWith(`${d1}${d2}`);
  }

  // ---------------------------------------------------------------- formatação
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const vazio = (v) => v === null || v === undefined || String(v).trim() === "";
  const txt = (v) => (vazio(v) ? "" : String(v).trim());

  function data(v) {
    if (vazio(v)) return "";
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
  }
  function idade(v) {
    const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "";
    const ini = new Date(+m[1], +m[2] - 1, +m[3]), hoje = new Date();
    let anos = hoje.getFullYear() - ini.getFullYear();
    if (hoje < new Date(hoje.getFullYear(), ini.getMonth(), ini.getDate())) anos--;
    return anos <= 0 ? "menos de 1 ano" : anos === 1 ? "1 ano" : `${anos} anos`;
  }
  function cnae(cod) {
    const d = String(cod || "").replace(/\D/g, "").padStart(7, "0");
    return d === "0000000" ? "" : `${d.slice(0, 2)}.${d.slice(2, 4)}-${d.slice(4, 5)}-${d.slice(5, 7)}`;
  }
  function cep(v) {
    const d = String(v || "").replace(/\D/g, "").padStart(8, "0");
    return /^0+$/.test(d) ? "" : `${d.slice(0, 5)}-${d.slice(5)}`;
  }
  function telefone(v) {
    const d = String(v || "").replace(/\D/g, "");
    if (d.length < 10) return d;
    const ddd = d.slice(0, 2), n = d.slice(2);
    return `(${ddd}) ${n.length === 9 ? n.slice(0, 5) + "-" + n.slice(5) : n.slice(0, 4) + "-" + n.slice(4)}`;
  }
  function titulo(s) {
    const menores = new Set(["de", "da", "do", "das", "dos", "e"]);
    return txt(s).toLowerCase().split(/\s+/).map((w, i) =>
      i > 0 && menores.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  function simNao(v) {
    if (v === true || /^s(im)?$/i.test(String(v))) return true;
    if (v === false || /^n(ão|ao)?$/i.test(String(v))) return false;
    return null;
  }

  // ---------------------------------------------------------------- normalizadores
  function deBrasilAPI(j) {
    return {
      cnpj: limpar(j.cnpj),
      razao: txt(j.razao_social),
      fantasia: txt(j.nome_fantasia),
      situacao: txt(j.descricao_situacao_cadastral),
      dataSituacao: txt(j.data_situacao_cadastral),
      motivoSituacao: txt(j.descricao_motivo_situacao_cadastral),
      tipo: txt(j.descricao_identificador_matriz_filial),
      abertura: txt(j.data_inicio_atividade),
      natureza: [txt(j.codigo_natureza_juridica), txt(j.natureza_juridica)].filter(Boolean).join(" · "),
      porte: txt(j.descricao_porte || j.porte),
      capital: typeof j.capital_social === "number" ? j.capital_social : Number(j.capital_social) || null,
      simples: simNao(j.opcao_pelo_simples),
      mei: simNao(j.opcao_pelo_mei),
      end: {
        tipoLogr: txt(j.descricao_tipo_de_logradouro), logradouro: txt(j.logradouro), numero: txt(j.numero),
        complemento: txt(j.complemento), bairro: txt(j.bairro), cep: cep(j.cep), municipio: txt(j.municipio), uf: txt(j.uf),
      },
      telefones: [j.ddd_telefone_1, j.ddd_telefone_2].map(telefone).filter(Boolean),
      email: txt(j.email).toLowerCase(),
      cnaePrincipal: { codigo: cnae(j.cnae_fiscal), descricao: txt(j.cnae_fiscal_descricao) },
      cnaesSec: (j.cnaes_secundarios || []).map((c) => ({ codigo: cnae(c.codigo), descricao: txt(c.descricao) })).filter((c) => c.codigo),
      socios: (j.qsa || []).map((s) => ({
        nome: txt(s.nome_socio), qualificacao: txt(s.qualificacao_socio),
        entrada: data(s.data_entrada_sociedade), faixa: txt(s.faixa_etaria),
      })).filter((s) => s.nome),
    };
  }

  function deCnpjWs(j) {
    const e = j.estabelecimento || {};
    const ativ = (a) => ({ codigo: cnae(a && (a.subclasse || a.id)), descricao: txt(a && a.descricao) });
    return {
      cnpj: limpar(e.cnpj),
      razao: txt(j.razao_social),
      fantasia: txt(e.nome_fantasia),
      situacao: txt(e.situacao_cadastral),
      dataSituacao: txt(e.data_situacao_cadastral),
      motivoSituacao: txt(e.motivo_situacao_cadastral && e.motivo_situacao_cadastral.descricao),
      tipo: txt(e.tipo),
      abertura: txt(e.data_inicio_atividade),
      natureza: [txt(j.natureza_juridica && j.natureza_juridica.id), txt(j.natureza_juridica && j.natureza_juridica.descricao)].filter(Boolean).join(" · "),
      porte: txt(j.porte && j.porte.descricao),
      capital: Number(j.capital_social) || null,
      simples: simNao(j.simples && j.simples.simples),
      mei: simNao(j.simples && j.simples.mei),
      end: {
        tipoLogr: txt(e.tipo_logradouro), logradouro: txt(e.logradouro), numero: txt(e.numero),
        complemento: txt(e.complemento), bairro: txt(e.bairro), cep: cep(e.cep),
        municipio: txt(e.cidade && e.cidade.nome), uf: txt(e.estado && e.estado.sigla),
      },
      telefones: [`${e.ddd1 || ""}${e.telefone1 || ""}`, `${e.ddd2 || ""}${e.telefone2 || ""}`].map(telefone).filter(Boolean),
      email: txt(e.email).toLowerCase(),
      cnaePrincipal: ativ(e.atividade_principal),
      cnaesSec: (e.atividades_secundarias || []).map(ativ).filter((c) => c.codigo),
      socios: (j.socios || []).map((s) => ({
        nome: txt(s.nome), qualificacao: txt(s.qualificacao_socio && s.qualificacao_socio.descricao),
        entrada: data(s.data_entrada), faixa: txt(s.faixa_etaria),
      })).filter((s) => s.nome),
    };
  }

  // ---------------------------------------------------------------- busca
  class ErroConsulta extends Error {
    constructor(msg, definitivo) { super(msg); this.definitivo = definitivo; }
  }

  async function buscarEm(p, c) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(p.url(c), { signal: ctrl.signal, headers: { Accept: "application/json" } });
      if (r.status === 404) throw new ErroConsulta("CNPJ não encontrado na base pública da Receita Federal.", true);
      if (r.status === 400) throw new ErroConsulta("A consulta recusou este CNPJ. Confira o número digitado.", true);
      if (r.status === 429) throw new ErroConsulta("Muitas consultas seguidas. Aguarde um minuto e tente de novo.", false);
      if (!r.ok) throw new ErroConsulta(`O serviço ${p.nome} respondeu com erro ${r.status}.`, false);
      const dados = p.normalizar(await r.json());
      if (!dados.razao) throw new ErroConsulta("Resposta sem dados da empresa.", false);
      dados.fonte = p.nome;
      return dados;
    } catch (e) {
      if (e instanceof ErroConsulta) throw e;
      throw new ErroConsulta(e.name === "AbortError" ? `O serviço ${p.nome} demorou demais para responder.` : `Não foi possível falar com o serviço ${p.nome}.`, false);
    } finally { clearTimeout(t); }
  }

  async function consultar(c) {
    let ultimo;
    for (const p of PROVEDORES) {
      try { return await buscarEm(p, c); }
      catch (e) { ultimo = e; if (e.definitivo) break; }
    }
    throw ultimo;
  }

  async function executar(valor) {
    const c = limpar(valor);
    input.value = mascarar(c);
    if (!valido(c)) {
      input.setAttribute("aria-invalid", "true");
      mostrarStatus(c.length < 14 ? "O CNPJ precisa ter 14 caracteres." : "Esse CNPJ não é válido: os dígitos verificadores não conferem.", "error");
      input.focus();
      return;
    }
    input.removeAttribute("aria-invalid");
    btn.disabled = true;
    mostrarStatus("Consultando a base pública…", "loading");
    try {
      const d = await consultar(c);
      d.consultadoEm = new Date();
      atual = d;
      renderizar(d);
      salvarHistorico(d);
      esconderStatus();
      try { history.replaceState(null, "", `?cnpj=${c}`); } catch (_) { /* sem suporte */ }
      $("result").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    } catch (e) {
      $("result").hidden = true;
      mostrarStatus(e.message || "Não foi possível consultar agora.", "error");
    } finally { btn.disabled = false; }
  }

  // ---------------------------------------------------------------- render
  function el(tag, attrs = {}, ...filhos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v; else n.setAttribute(k, v);
    }
    for (const f of filhos) if (f !== null && f !== undefined && f !== "") n.append(f);
    return n;
  }

  function fatos(dl, pares) {
    dl.replaceChildren();
    for (const [rotulo, valor, extra] of pares) {
      if (vazio(valor)) continue;
      dl.append(el("dt", {}, rotulo), el("dd", {}, String(valor), extra ? el("small", {}, ` · ${extra}`) : null));
    }
  }

  function classeSituacao(s) {
    const x = s.toLowerCase();
    if (x.includes("ativa")) return "ok";
    if (x.includes("suspens") || x.includes("inapta")) return "warn";
    if (x.includes("baixad") || x.includes("nula")) return "bad";
    return "";
  }

  function enderecoLinhas(e) {
    const rua = [e.tipoLogr, e.logradouro].filter(Boolean).join(" ");
    const l1 = [rua, e.numero].filter(Boolean).join(", ") + (e.complemento ? ` – ${e.complemento}` : "");
    const cidade = [titulo(e.municipio), e.uf].filter(Boolean).join("/");
    const l2 = [titulo(e.bairro), cidade].filter(Boolean).join(" · ");
    return [titulo(l1), l2, e.cep ? `CEP ${e.cep}` : ""].filter(Boolean);
  }
  function enderecoBusca(e) {
    return [[e.tipoLogr, e.logradouro].filter(Boolean).join(" "), e.numero, e.bairro, e.municipio, e.uf, e.cep, "Brasil"].filter(Boolean).join(", ");
  }

  function renderizar(d) {
    const sit = $("r-situacao");
    sit.textContent = d.situacao || "Situação não informada";
    sit.className = "chip " + classeSituacao(d.situacao || "");
    $("r-tipo").textContent = d.tipo || "";
    $("r-tipo").hidden = !d.tipo;
    $("r-mei").hidden = d.mei !== true;
    $("r-simples").hidden = !(d.simples === true && d.mei !== true);
    $("r-razao").textContent = d.razao;
    $("r-fantasia").textContent = d.fantasia ? `Nome fantasia: ${d.fantasia}` : "";
    $("r-fantasia").hidden = !d.fantasia;
    $("r-cnpj").textContent = mascarar(d.cnpj);

    fatos($("r-cadastro"), [
      ["Abertura", data(d.abertura), idade(d.abertura)],
      ["Situação", d.situacao, d.dataSituacao ? `desde ${data(d.dataSituacao)}` : ""],
      ["Motivo da situação", /sem motivo/i.test(d.motivoSituacao) ? "" : d.motivoSituacao],
      ["Natureza jurídica", d.natureza],
      ["Porte", d.porte],
      ["Capital social", d.capital ? brl.format(d.capital) : ""],
      ["Simples Nacional", d.simples === null ? "" : d.simples ? "Optante" : "Não optante"],
      ["MEI", d.mei === null ? "" : d.mei ? "Sim" : "Não"],
    ]);

    const addr = $("r-endereco");
    addr.replaceChildren();
    enderecoLinhas(d.end).forEach((l, i) => { if (i) addr.append(el("br")); addr.append(l); });
    const q = encodeURIComponent(enderecoBusca(d.end));
    $("r-maps").href = `https://www.google.com/maps/search/?api=1&query=${q}`;
    $("r-rota").href = `https://www.google.com/maps/dir/?api=1&destination=${q}`;
    $("r-mapa").src = `https://maps.google.com/maps?q=${q}&z=16&output=embed`;

    fatos($("r-contato"), [
      ["Telefone", d.telefones.join("  ·  ")],
      ["E-mail", d.email],
    ]);
    if (!d.telefones.length && !d.email) $("r-contato").append(el("dd", { class: "muted" }, "Sem contato na base pública."));

    const cp = $("r-cnae-principal");
    cp.replaceChildren(el("span", { class: "cnae-code" }, d.cnaePrincipal.codigo || "—"), el("span", {}, d.cnaePrincipal.descricao || "Atividade principal não informada"));
    const sec = $("r-cnae-sec");
    sec.replaceChildren(...d.cnaesSec.map((c) => el("li", {}, el("span", { class: "cnae-code" }, c.codigo), el("span", {}, c.descricao))));
    $("r-cnae-sec-wrap").hidden = d.cnaesSec.length === 0;
    $("r-cnae-sec-wrap").open = d.cnaesSec.length > 0 && d.cnaesSec.length <= 8;
    $("r-cnae-sec-title").textContent = `Atividades secundárias (${d.cnaesSec.length})`;

    const tb = $("r-qsa");
    tb.replaceChildren(...d.socios.map((s) => el("tr", {}, el("td", {}, s.nome), el("td", {}, s.qualificacao), el("td", { class: "mono" }, s.entrada), el("td", {}, s.faixa))));
    tb.closest("table").hidden = d.socios.length === 0;
    $("r-qsa-vazio").hidden = d.socios.length > 0;

    $("r-fonte").textContent = d.fonte;
    $("r-quando").textContent = d.consultadoEm.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    $("result").hidden = false;
    document.title = `${d.razao} · Cadastro Aberto`;
  }

  // ---------------------------------------------------------------- status / toast
  function mostrarStatus(msg, tipo) { const s = $("status"); s.textContent = msg; s.className = `status ${tipo || ""}`; s.hidden = false; }
  function esconderStatus() { $("status").hidden = true; }
  let toastT;
  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) { t = el("div", { class: "toast", role: "status" }); document.body.append(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
  }
  async function copiar(texto, rotulo) {
    try { await navigator.clipboard.writeText(texto); toast(`${rotulo} copiado`); }
    catch (_) { window.prompt(`Copie ${rotulo.toLowerCase()}:`, texto); }
  }

  // ---------------------------------------------------------------- histórico
  function lerHistorico() { try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch (_) { return []; } }
  function salvarHistorico(d) {
    const h = [{ cnpj: d.cnpj, razao: d.fantasia || d.razao }, ...lerHistorico().filter((x) => x.cnpj !== d.cnpj)].slice(0, HIST_MAX);
    try { localStorage.setItem(HIST_KEY, JSON.stringify(h)); } catch (_) { /* navegação privada */ }
    desenharHistorico();
  }
  function desenharHistorico() {
    const h = lerHistorico();
    $("history").hidden = h.length === 0;
    $("history-list").replaceChildren(...h.map((x) => {
      const b = el("button", { type: "button", title: mascarar(x.cnpj) }, titulo(x.razao));
      b.addEventListener("click", () => executar(x.cnpj));
      return b;
    }));
  }

  // ---------------------------------------------------------------- exportação
  function linhasEmpresa(d) {
    return [
      ["CNPJ", mascarar(d.cnpj)], ["Razão social", d.razao], ["Nome fantasia", d.fantasia],
      ["Situação cadastral", d.situacao], ["Data da situação", data(d.dataSituacao)], ["Motivo da situação", d.motivoSituacao],
      ["Matriz/Filial", d.tipo], ["Data de abertura", data(d.abertura)], ["Natureza jurídica", d.natureza], ["Porte", d.porte],
      ["Capital social (R$)", d.capital ?? ""], ["Simples Nacional", d.simples === null ? "" : d.simples ? "Sim" : "Não"],
      ["MEI", d.mei === null ? "" : d.mei ? "Sim" : "Não"],
      ["Logradouro", [d.end.tipoLogr, d.end.logradouro].filter(Boolean).join(" ")], ["Número", d.end.numero],
      ["Complemento", d.end.complemento], ["Bairro", d.end.bairro], ["Município", d.end.municipio], ["UF", d.end.uf], ["CEP", d.end.cep],
      ["Telefones", d.telefones.join(" / ")], ["E-mail", d.email],
      ["CNAE principal", `${d.cnaePrincipal.codigo} ${d.cnaePrincipal.descricao}`.trim()],
      ["CNAEs secundários", d.cnaesSec.map((c) => `${c.codigo} ${c.descricao}`).join(" | ")],
      ["Sócios", d.socios.map((s) => `${s.nome} (${s.qualificacao})`).join(" | ")],
      ["Fonte", `Receita Federal via ${d.fonte}`], ["Consultado em", d.consultadoEm.toLocaleString("pt-BR")],
    ];
  }
  function nomeArquivo(d, ext) {
    const base = (d.fantasia || d.razao).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40);
    return `CNPJ_${d.cnpj}_${base}.${ext}`;
  }
  function baixar(blob, nome) {
    const a = el("a", { href: URL.createObjectURL(blob), download: nome });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function exportarCSV(d) {
    const linhas = linhasEmpresa(d);
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [linhas.map((l) => esc(l[0])).join(";"), linhas.map((l) => esc(l[1])).join(";")].join("\r\n");
    baixar(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), nomeArquivo(d, "csv"));
    toast("CSV gerado");
  }
  function exportarXLSX(d) {
    if (!window.XLSX) { toast("Biblioteca do Excel ainda carregando. Tente em instantes."); return; }
    const wb = XLSX.utils.book_new();
    const empresa = XLSX.utils.aoa_to_sheet([["Campo", "Valor"], ...linhasEmpresa(d)]);
    empresa["!cols"] = [{ wch: 22 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, empresa, "Empresa");
    const cn = XLSX.utils.aoa_to_sheet([["Tipo", "Código", "Descrição"],
      ["Principal", d.cnaePrincipal.codigo, d.cnaePrincipal.descricao], ...d.cnaesSec.map((c) => ["Secundária", c.codigo, c.descricao])]);
    cn["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, cn, "CNAEs");
    const so = XLSX.utils.aoa_to_sheet([["Nome", "Qualificação", "Entrada", "Faixa etária"], ...d.socios.map((s) => [s.nome, s.qualificacao, s.entrada, s.faixa])]);
    so["!cols"] = [{ wch: 44 }, { wch: 36 }, { wch: 12 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, so, "Sócios");
    XLSX.writeFile(wb, nomeArquivo(d, "xlsx"));
    toast("Planilha gerada");
  }
  function imprimir(d) {
    const cel = (rot, val, full) => `<div class="pc-cell${full ? " full" : ""}"><b>${esc(rot)}</b><span>${esc(val || "—")}</span></div>`;
    const e = d.end;
    const html = `
      <div class="pc-head"><h1>Comprovante de dados cadastrais · CNPJ</h1><span>Cadastro Aberto · ${esc(d.consultadoEm.toLocaleString("pt-BR"))}</span></div>
      <div class="pc-grid">
        ${cel("Número de inscrição", `${mascarar(d.cnpj)} · ${d.tipo}`)}${cel("Data de abertura", data(d.abertura))}
        ${cel("Nome empresarial", d.razao, true)}
        ${cel("Nome fantasia", d.fantasia)}${cel("Porte", d.porte)}
        ${cel("Atividade econômica principal", `${d.cnaePrincipal.codigo} ${d.cnaePrincipal.descricao}`, true)}
        ${cel("Atividades econômicas secundárias", d.cnaesSec.map((c) => `${c.codigo} ${c.descricao}`).join("; ") || "Não informada", true)}
        ${cel("Natureza jurídica", d.natureza, true)}
        ${cel("Logradouro", [e.tipoLogr, e.logradouro].filter(Boolean).join(" "))}${cel("Número / complemento", [e.numero, e.complemento].filter(Boolean).join(" – "))}
        ${cel("CEP", e.cep)}${cel("Bairro", e.bairro)}
        ${cel("Município", e.municipio)}${cel("UF", e.uf)}
        ${cel("Telefone", d.telefones.join(" / "))}${cel("E-mail", d.email)}
        ${cel("Situação cadastral", d.situacao)}${cel("Data da situação", data(d.dataSituacao))}
        ${cel("Capital social", d.capital ? brl.format(d.capital) : "")}${cel("Simples / MEI", [d.simples ? "Simples: sim" : d.simples === false ? "Simples: não" : "", d.mei ? "MEI: sim" : d.mei === false ? "MEI: não" : ""].filter(Boolean).join(" · "))}
      </div>
      ${d.socios.length ? `<table class="pc-qsa"><thead><tr><th>Sócio / administrador</th><th>Qualificação</th><th>Entrada</th></tr></thead><tbody>${d.socios.map((s) => `<tr><td>${esc(s.nome)}</td><td>${esc(s.qualificacao)}</td><td>${esc(s.entrada)}</td></tr>`).join("")}</tbody></table>` : ""}
      <p class="pc-foot">Documento informativo gerado a partir de dados públicos do CNPJ (Receita Federal) via ${esc(d.fonte)}. Não substitui o comprovante oficial emitido pela Receita Federal.</p>`;
    $("print-card").innerHTML = html;
    window.print();
  }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---------------------------------------------------------------- eventos
  input.addEventListener("input", () => {
    const pos = input.selectionStart, antes = input.value.length;
    input.value = mascarar(input.value);
    input.removeAttribute("aria-invalid");
    const depois = input.value.length;
    try { input.setSelectionRange(pos + (depois - antes), pos + (depois - antes)); } catch (_) { /* ok */ }
  });
  input.addEventListener("paste", (ev) => {
    const t = (ev.clipboardData || window.clipboardData).getData("text");
    if (t) { ev.preventDefault(); input.value = mascarar(t); if (limpar(t).length === 14) executar(t); }
  });
  form.addEventListener("submit", (ev) => { ev.preventDefault(); executar(input.value); });

  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-copy]");
    if (!b || !atual) return;
    if (b.dataset.copy === "cnpj") copiar(mascarar(atual.cnpj), "CNPJ");
    if (b.dataset.copy === "endereco") copiar(enderecoLinhas(atual.end).join(", "), "Endereço");
  });
  $("btn-csv").addEventListener("click", () => atual && exportarCSV(atual));
  $("btn-xlsx").addEventListener("click", () => atual && exportarXLSX(atual));
  $("btn-print").addEventListener("click", () => atual && imprimir(atual));
  $("btn-json").addEventListener("click", () => atual && copiar(JSON.stringify(atual, null, 2), "JSON"));

  // ---------------------------------------------------------------- abas
  function mudarModo(modo) {
    const lote = modo === "lote";
    $("tab-unica").setAttribute("aria-selected", String(!lote));
    $("tab-lote").setAttribute("aria-selected", String(lote));
    $("modo-unica").hidden = lote;
    $("modo-lote").hidden = !lote;
    (lote ? $("lote-texto") : input).focus();
  }
  $("tab-unica").addEventListener("click", () => mudarModo("unica"));
  $("tab-lote").addEventListener("click", () => mudarModo("lote"));

  // ---------------------------------------------------------------- consulta em lote
  const LOTE_MAX = 1000;
  const LOTE_PAUSA_MS = 400;        // intervalo entre consultas, para respeitar as APIs públicas
  const LOTE_ESPERA_LIMITE_MS = 20000;
  const lote = { fila: [], resultados: [], rodando: false, pausado: false, cancelado: false, invalidos: 0, repetidos: 0 };

  /** Extrai CNPJs de qualquer texto (lista colada, CSV, conteúdo de planilha). */
  function extrairCnpjs(texto) {
    const t = String(texto || "").toUpperCase();
    const re = /(?<![0-9A-Z])([0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}|[0-9A-Z]{12}\d{2}|\d{13})(?![0-9A-Z])/g;
    const vistos = new Set(), validos = [];
    let invalidos = 0, repetidos = 0, m;
    while ((m = re.exec(t))) {
      let c = limpar(m[1]);
      if (/^\d{13}$/.test(c)) c = "0" + c; // planilha que perdeu o zero à esquerda
      if (!valido(c)) { if (/^\d{8}/.test(c) || /[.\/-]/.test(m[1])) invalidos++; continue; }
      if (vistos.has(c)) { repetidos++; continue; }
      vistos.add(c); validos.push(c);
    }
    return { validos, invalidos, repetidos };
  }

  function atualizarResumoEntrada() {
    const r = extrairCnpjs($("lote-texto").value);
    lote.fila = r.validos.slice(0, LOTE_MAX);
    lote.invalidos = r.invalidos; lote.repetidos = r.repetidos;
    const partes = [];
    partes.push(r.validos.length === 1 ? "1 CNPJ válido" : `${r.validos.length} CNPJs válidos`);
    if (r.repetidos) partes.push(`${r.repetidos} repetido${r.repetidos > 1 ? "s" : ""} ignorado${r.repetidos > 1 ? "s" : ""}`);
    if (r.invalidos) partes.push(`${r.invalidos} com dígito inválido`);
    if (r.validos.length > LOTE_MAX) partes.push(`só os primeiros ${LOTE_MAX} serão consultados`);
    const seg = Math.ceil(lote.fila.length * (LOTE_PAUSA_MS + 600) / 1000);
    if (lote.fila.length > 1) partes.push(`tempo estimado: ${seg < 60 ? seg + " s" : Math.ceil(seg / 60) + " min"}`);
    $("lote-resumo").textContent = r.validos.length || r.invalidos ? partes.join(" · ") : "Nenhum CNPJ identificado ainda.";
    $("lote-iniciar").disabled = lote.rodando || lote.fila.length === 0;
  }

  $("lote-texto").addEventListener("input", atualizarResumoEntrada);

  $("lote-file").addEventListener("change", async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    $("lote-file-nome").textContent = f.name;
    try {
      let texto;
      if (/\.xlsx?$/i.test(f.name)) {
        if (!window.XLSX) throw new Error("biblioteca do Excel não carregou");
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
        // valores brutos: evita que o Excel transforme CNPJ numérico em notação científica
        texto = wb.SheetNames.map((n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" })
          .map((linha) => linha.map((v) => (typeof v === "number" ? v.toFixed(0) : String(v))).join(";")).join("\n")).join("\n");
      } else {
        texto = await f.text();
      }
      const achados = extrairCnpjs(texto).validos;
      const atual = $("lote-texto").value.trim();
      $("lote-texto").value = (atual ? atual + "\n" : "") + achados.map(mascarar).join("\n");
      atualizarResumoEntrada();
      toast(achados.length ? `${achados.length} CNPJs encontrados no arquivo` : "Nenhum CNPJ válido encontrado no arquivo");
    } catch (e) {
      toast(`Não foi possível ler o arquivo: ${e.message}`);
    } finally { ev.target.value = ""; }
  });

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  async function aguardarSePausado() { while (lote.pausado && !lote.cancelado) await dormir(250); }

  function linhaPendente(i, c) {
    const tr = el("tr", { class: "pendente", "data-i": String(i) },
      el("td", {}, String(i + 1)), el("td", { class: "mono" }, mascarar(c)), el("td", {}, "Na fila…"),
      el("td", {}, ""), el("td", {}, ""), el("td", {}, ""), el("td", {}, ""));
    return tr;
  }
  function preencherLinha(i) {
    const r = lote.resultados[i];
    const tr = $("lote-linhas").querySelector(`tr[data-i="${i}"]`);
    if (!tr) return;
    if (r.dados) {
      const d = r.dados;
      const sit = el("span", { class: "chip " + classeSituacao(d.situacao || "") }, d.situacao || "—");
      tr.className = "ok";
      tr.title = "Ver ficha completa";
      tr.replaceChildren(
        el("td", {}, String(i + 1)), el("td", { class: "mono" }, mascarar(d.cnpj)), el("td", {}, d.razao),
        el("td", {}, sit), el("td", {}, [titulo(d.end.municipio), d.end.uf].filter(Boolean).join("/")),
        el("td", {}, [d.cnaePrincipal.codigo, d.cnaePrincipal.descricao].filter(Boolean).join(" ")),
        el("td", {}, d.telefones[0] || ""));
    } else {
      tr.className = "falha";
      tr.children[2].replaceChildren(el("span", { class: "erro" }, r.erro));
    }
  }

  function atualizarProgresso() {
    const total = lote.resultados.length;
    const feitos = lote.resultados.filter((r) => r.dados || r.erro).length;
    const pct = total ? Math.round((feitos / total) * 100) : 0;
    $("lote-barra").style.width = pct + "%";
    let txt = `${feitos} de ${total} consultados (${pct}%)`;
    if (lote.cancelado) txt += " · cancelado";
    else if (lote.pausado) txt += " · pausado";
    else if (!lote.rodando && feitos === total) txt = `Concluído: ${total} CNPJ${total > 1 ? "s" : ""} consultado${total > 1 ? "s" : ""}`;
    $("lote-progresso-txt").textContent = txt;

    const cont = {};
    for (const r of lote.resultados) {
      const k = r.dados ? (r.dados.situacao || "Sem situação") : r.erro ? "Não encontrado / erro" : null;
      if (k) cont[k] = (cont[k] || 0) + 1;
    }
    $("lote-contagem").replaceChildren(...Object.entries(cont).map(([k, n]) =>
      el("span", { class: "chip " + (k.startsWith("Não encontrado") ? "bad" : classeSituacao(k)) }, `${k}: ${n}`)));
    const tem = lote.resultados.some((r) => r.dados || r.erro);
    $("lote-xlsx").disabled = !tem; $("lote-csv").disabled = !tem;
  }

  async function iniciarLote() {
    if (lote.rodando || !lote.fila.length) return;
    lote.rodando = true; lote.pausado = false; lote.cancelado = false;
    lote.resultados = lote.fila.map((c) => ({ cnpj: c, dados: null, erro: null }));
    $("lote-linhas").replaceChildren(...lote.fila.map((c, i) => linhaPendente(i, c)));
    $("lote-painel").hidden = false;
    $("lote-iniciar").disabled = true; $("lote-texto").disabled = true;
    $("lote-pausar").hidden = false; $("lote-cancelar").hidden = false; $("lote-pausar").textContent = "Pausar";
    atualizarProgresso();

    for (let i = 0; i < lote.resultados.length; i++) {
      await aguardarSePausado();
      if (lote.cancelado) break;
      const r = lote.resultados[i];
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        try {
          r.dados = await consultar(r.cnpj);
          r.dados.consultadoEm = new Date();
          r.erro = null;
          break;
        } catch (e) {
          r.erro = e.message || "Erro na consulta";
          if (e.definitivo || tentativa === 2 || lote.cancelado) break;
          $("lote-progresso-txt").textContent = "Limite das APIs atingido. Aguardando para continuar…";
          await dormir(LOTE_ESPERA_LIMITE_MS);
        }
      }
      preencherLinha(i);
      atualizarProgresso();
      if (i < lote.resultados.length - 1) await dormir(LOTE_PAUSA_MS);
    }

    lote.rodando = false;
    $("lote-texto").disabled = false;
    $("lote-pausar").hidden = true; $("lote-cancelar").hidden = true;
    atualizarResumoEntrada();
    atualizarProgresso();
    toast(lote.cancelado ? "Consulta em lote cancelada" : "Consulta em lote concluída");
  }

  $("lote-iniciar").addEventListener("click", iniciarLote);
  $("lote-pausar").addEventListener("click", () => {
    lote.pausado = !lote.pausado;
    $("lote-pausar").textContent = lote.pausado ? "Continuar" : "Pausar";
    atualizarProgresso();
  });
  $("lote-cancelar").addEventListener("click", () => { lote.cancelado = true; lote.pausado = false; atualizarProgresso(); });

  $("lote-linhas").addEventListener("click", (ev) => {
    const tr = ev.target.closest("tr.ok");
    if (!tr) return;
    const d = lote.resultados[+tr.dataset.i].dados;
    atual = d;
    renderizar(d);
    esconderStatus();
    input.value = mascarar(d.cnpj);
    mudarModo("unica");
    $("result").scrollIntoView({ block: "start" });
  });

  function tabelaLote() {
    const ok = lote.resultados.filter((r) => r.dados);
    const cab = ["Status", ...linhasEmpresa(ok[0] ? ok[0].dados : { ...modeloVazio(), consultadoEm: new Date() }).map((l) => l[0])];
    const linhas = lote.resultados.filter((r) => r.dados || r.erro).map((r) =>
      r.dados ? ["OK", ...linhasEmpresa(r.dados).map((l) => l[1])]
              : [r.erro, mascarar(r.cnpj), ...Array(cab.length - 2).fill("")]);
    return [cab, ...linhas];
  }
  function modeloVazio() {
    return { cnpj: "", razao: "", fantasia: "", situacao: "", dataSituacao: "", motivoSituacao: "", tipo: "", abertura: "", natureza: "", porte: "",
      capital: null, simples: null, mei: null, end: { tipoLogr: "", logradouro: "", numero: "", complemento: "", bairro: "", cep: "", municipio: "", uf: "" },
      telefones: [], email: "", cnaePrincipal: { codigo: "", descricao: "" }, cnaesSec: [], socios: [], fonte: "" };
  }
  const carimbo = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

  $("lote-xlsx").addEventListener("click", () => {
    if (!window.XLSX) { toast("Biblioteca do Excel ainda carregando. Tente em instantes."); return; }
    const wb = XLSX.utils.book_new();
    const emp = XLSX.utils.aoa_to_sheet(tabelaLote());
    emp["!cols"] = [{ wch: 14 }, { wch: 20 }, { wch: 42 }, { wch: 28 }, { wch: 12 }];
    emp["!autofilter"] = { ref: emp["!ref"] };
    XLSX.utils.book_append_sheet(wb, emp, "Empresas");
    const socios = [["CNPJ", "Razão social", "Sócio / administrador", "Qualificação", "Entrada", "Faixa etária"]];
    for (const r of lote.resultados) if (r.dados) for (const s of r.dados.socios)
      socios.push([mascarar(r.dados.cnpj), r.dados.razao, s.nome, s.qualificacao, s.entrada, s.faixa]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(socios), "Sócios");
    const cnaes = [["CNPJ", "Razão social", "Tipo", "Código", "Descrição"]];
    for (const r of lote.resultados) if (r.dados) {
      cnaes.push([mascarar(r.dados.cnpj), r.dados.razao, "Principal", r.dados.cnaePrincipal.codigo, r.dados.cnaePrincipal.descricao]);
      for (const c of r.dados.cnaesSec) cnaes.push([mascarar(r.dados.cnpj), r.dados.razao, "Secundária", c.codigo, c.descricao]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cnaes), "CNAEs");
    XLSX.writeFile(wb, `Consulta_CNPJ_lote_${carimbo()}.xlsx`);
    toast("Planilha do lote gerada");
  });
  $("lote-csv").addEventListener("click", () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = tabelaLote().map((l) => l.map(esc).join(";")).join("\r\n");
    baixar(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `Consulta_CNPJ_lote_${carimbo()}.csv`);
    toast("CSV do lote gerado");
  });

  // ---------------------------------------------------------------- início
  desenharHistorico();
  const inicial = new URLSearchParams(location.search).get("cnpj");
  if (location.hash === "#lote") mudarModo("lote");
  else if (inicial) executar(inicial); else input.focus();

  // exposto para testes
  window.CadastroAberto = { valido, limpar, mascarar, deBrasilAPI, deCnpjWs, cnae, extrairCnpjs };
})();
