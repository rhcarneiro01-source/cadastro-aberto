/*!
 * Cadastro Aberto — planilha do lote (Excel com dashboard)
 * (c) 2026 Renan Henrique Carneiro — Licença MIT
 *
 * Gera um .xlsx formatado com ExcelJS:
 *   Dashboard  indicadores e gráficos de barras, calculados por FÓRMULAS sobre a aba Empresas
 *   Empresas   uma linha por CNPJ, com filtro, painéis congelados e cores por situação
 *   Sócios     quadro societário de todas as empresas
 *   CNAEs      atividades principal e secundárias
 *   Sobre      fonte dos dados e como ler a planilha
 *
 * Os números do Dashboard são fórmulas (CONT.SE, MED etc.): se a pessoa apagar ou editar
 * linhas na aba Empresas, o Dashboard se recalcula sozinho no Excel.
 */
(() => {
  "use strict";

  // ---------------------------------------------------------------- estilo
  const COR = {
    marca: "FF0B5D4B", marcaClara: "FFDDEFE8", tinta: "FF13201C", tinta2: "FF4A5A55", tinta3: "FF7A8984",
    linha: "FFDCE3E0", fundo: "FFF3F5F4", superficie2: "FFEEF2F0", branco: "FFFFFFFF",
    ok: "FF1E7D45", okBg: "FFE2F3E8", warn: "FF9A6200", warnBg: "FFFBF0D9", bad: "FFB42318", badBg: "FFFBE4E1",
    neutro: "FF7A8984", neutroBg: "FFEEF2F0",
  };
  const FONTE = "Arial";
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const fonte = (o = {}) => ({ name: FONTE, size: 10, color: { argb: COR.tinta }, ...o });
  const borda = (argb = COR.linha) => ({ style: "thin", color: { argb } });
  const FMT_DATA = "dd/mm/yyyy";
  const FMT_BRL = '"R$" #,##0.00';
  const FMT_BRL0 = '"R$" #,##0';
  const FMT_PCT = "0%";
  const BARRA_MAX = 20; // tamanho máximo da barra de texto (caracteres █)

  /** Texto seguro dentro de fórmula: aspas duplicadas. */
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  /** Critério de CONT.SE literal: escapa curingas (* ? ~). */
  const criterio = (s) => q(String(s).replace(/[~*?]/g, "~$&"));

  function corSituacao(rotulo, classeSituacao, NAO_ENCONTRADO) {
    if (rotulo === NAO_ENCONTRADO) return [COR.neutro, COR.neutroBg];
    const c = classeSituacao(rotulo);
    return c === "ok" ? [COR.ok, COR.okBg] : c === "warn" ? [COR.warn, COR.warnBg] : c === "bad" ? [COR.bad, COR.badBg] : [COR.neutro, COR.neutroBg];
  }

  function cabecalho(ws, linha) {
    const r = ws.getRow(linha);
    r.height = 22;
    r.eachCell((c) => {
      c.font = fonte({ bold: true, color: { argb: COR.branco } });
      c.fill = fill(COR.marca);
      c.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
      c.border = { bottom: borda(COR.marca) };
    });
  }
  function corpo(ws, primeira, ultima, ncols) {
    for (let i = primeira; i <= ultima; i++) {
      const r = ws.getRow(i);
      for (let c = 1; c <= ncols; c++) {
        const cel = r.getCell(c);
        cel.font = cel.font && cel.font.bold ? cel.font : fonte();
        cel.border = { bottom: borda() };
        cel.alignment = { vertical: "top", ...(cel.alignment || {}) };
      }
    }
  }

  function dataExcel(v) {
    const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  }

  // ---------------------------------------------------------------- aba Empresas
  // As letras são usadas nas fórmulas do Dashboard, então a ordem importa.
  const COLS = [
    ["Nº", 6], ["Status da consulta", 16], ["CNPJ", 20], ["Razão social", 40], ["Nome fantasia", 26],
    ["Situação cadastral", 17], ["Data da situação", 13], ["Motivo da situação", 22], ["Matriz/Filial", 12],
    ["Data de abertura", 13], ["Anos de empresa", 10], ["Tempo de empresa", 16], ["Porte", 22], ["Capital social", 17],
    ["Simples Nacional", 10], ["MEI", 7], ["Logradouro", 32], ["Número", 9], ["Complemento", 18], ["Bairro", 20],
    ["Município", 20], ["UF", 6], ["Cidade/UF", 22], ["CEP", 11], ["Telefones", 22], ["E-mail", 28],
    ["CNAE principal", 12], ["Atividade principal", 48], ["Qtd. CNAEs secundários", 11], ["Qtd. sócios", 9], ["Consultado em", 17],
  ];
  const L = {}; // letra de cada coluna pelo nome
  COLS.forEach(([nome], i) => { L[nome] = colunaLetra(i + 1); });
  function colunaLetra(n) { let s = ""; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  // coluna da aba Empresas que responde a cada dimensão do painel do site
  const COLUNA_DIM = { situacao: "Situação cadastral", idade: "Tempo de empresa", uf: "UF", porte: "Porte", cidade: "Cidade/UF", cnae: "Atividade principal" };

  const FORMULA_FAIXA = (k) =>
    `IF(${k}="","",IF(${k}<1,"Menos de 1 ano",IF(${k}<=2,"1 a 2 anos",IF(${k}<=5,"3 a 5 anos",IF(${k}<=10,"6 a 10 anos",IF(${k}<=20,"11 a 20 anos","Mais de 20 anos"))))))`;

  function abaEmpresas(wb, feitos, u) {
    const ws = wb.addWorksheet("Empresas", { views: [{ state: "frozen", xSplit: 4, ySplit: 1 }], properties: { tabColor: { argb: COR.marca } } });
    ws.columns = COLS.map(([header, width]) => ({ header, width }));
    cabecalho(ws, 1);

    feitos.forEach((r, i) => {
      const n = i + 2;
      const d = r.dados;
      if (!d) {
        ws.addRow([i + 1, "Não encontrado", u.mascarar(r.cnpj), r.erro || "", "", u.NAO_ENCONTRADO]);
        return;
      }
      const abertura = dataExcel(d.abertura);
      const anos = u.anosDeEmpresa(d.abertura);
      const cidade = [u.titulo(d.end.municipio), d.end.uf].filter(Boolean).join("/") || "Sem cidade";
      ws.addRow([
        i + 1, "OK", u.mascarar(d.cnpj), d.razao, d.fantasia,
        u.titulo(d.situacao || "Sem situação"), dataExcel(d.dataSituacao), d.motivoSituacao, u.titulo(d.tipo),
        abertura,
        abertura ? { formula: `DATEDIF(${L["Data de abertura"]}${n},TODAY(),"y")`, result: anos } : "",
        { formula: FORMULA_FAIXA(`${L["Anos de empresa"]}${n}`), result: u.faixaIdade(anos) || "" },
        u.porteCurto(d), d.capital ?? "",
        d.simples === null ? "" : d.simples ? "Sim" : "Não", d.mei === null ? "" : d.mei ? "Sim" : "Não",
        [d.end.tipoLogr, d.end.logradouro].filter(Boolean).join(" "), d.end.numero, d.end.complemento, d.end.bairro,
        u.titulo(d.end.municipio), d.end.uf || "Sem UF", cidade, d.end.cep,
        d.telefones.join(" / "), d.email,
        d.cnaePrincipal.codigo, d.cnaePrincipal.descricao || "Sem atividade",
        d.cnaesSec.length, d.socios.length,
        d.consultadoEm ? d.consultadoEm.toLocaleString("pt-BR") : "",
      ]);
    });

    const ultima = feitos.length + 1;
    corpo(ws, 2, ultima, COLS.length);
    ws.getColumn(L["Data da situação"]).numFmt = FMT_DATA;
    ws.getColumn(L["Data de abertura"]).numFmt = FMT_DATA;
    ws.getColumn(L["Capital social"]).numFmt = FMT_BRL;
    ws.getColumn(L["Nº"]).alignment = { horizontal: "center", vertical: "top" };
    for (const nome of ["Anos de empresa", "Qtd. CNAEs secundários", "Qtd. sócios", "UF", "MEI", "Simples Nacional"])
      ws.getColumn(L[nome]).alignment = { horizontal: "center", vertical: "top" };
    ws.getColumn(L["CNPJ"]).font = fonte({ name: "Consolas" });
    cabecalho(ws, 1); // reaplica: as fontes/alinhamentos de coluna acima também atingem o cabeçalho
    ws.getRow(1).eachCell((c) => { c.alignment = { vertical: "middle", horizontal: "left", wrapText: true }; });
    ws.getRow(1).height = 30;
    ws.autoFilter = { from: "A1", to: `${colunaLetra(COLS.length)}1` };

    // cores da situação e do status (formatação condicional: acompanha edições)
    if (ultima >= 2) {
      const sit = `${L["Situação cadastral"]}2:${L["Situação cadastral"]}${ultima}`;
      const ref = `$${L["Situação cadastral"]}2`;
      const regra = (formula, cor, bg) => ({ type: "expression", formulae: [formula], style: { font: { color: { argb: cor }, bold: true }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: bg } } } });
      ws.addConditionalFormatting({ ref: sit, rules: [
        regra(`${ref}="Ativa"`, COR.ok, COR.okBg),
        regra(`OR(${ref}="Suspensa",${ref}="Inapta")`, COR.warn, COR.warnBg),
        regra(`OR(${ref}="Baixada",${ref}="Nula")`, COR.bad, COR.badBg),
        regra(`${ref}=${q(u.NAO_ENCONTRADO)}`, COR.neutro, COR.neutroBg),
      ] });
      ws.addConditionalFormatting({ ref: `${L["Status da consulta"]}2:${L["Status da consulta"]}${ultima}`, rules: [
        { type: "expression", formulae: [`$${L["Status da consulta"]}2<>"OK"`], style: { font: { color: { argb: COR.bad }, bold: true } } },
      ] });
    }
    return { ws, ultima };
  }

  // ---------------------------------------------------------------- aba Dashboard
  function abaDashboard(wb, feitos, u, ultima) {
    const ws = wb.addWorksheet("Dashboard", { views: [{ showGridLines: false }], properties: { tabColor: { argb: COR.marca } } });
    // B C D E | F (espaço) | G H I J
    ws.columns = [{ width: 2 }, { width: 40 }, { width: 10 }, { width: 8 }, { width: 27 }, { width: 3 }, { width: 40 }, { width: 10 }, { width: 8 }, { width: 27 }, { width: 2 }];
    for (let r = 1; r <= 200; r++) for (let c = 1; c <= 11; c++) ws.getRow(r).getCell(c).fill = fill(COR.fundo);

    const E = (col) => `Empresas!$${L[col]}$2:$${L[col]}$${Math.max(2, ultima)}`;
    const ok = feitos.filter((r) => r.dados);
    const nOk = ok.length;

    // título
    ws.mergeCells("B2:J2");
    Object.assign(ws.getCell("B2"), { value: "Cadastro Aberto · Análise do lote", font: fonte({ size: 18, bold: true }) });
    ws.getRow(2).height = 30;
    ws.mergeCells("B3:J3");
    Object.assign(ws.getCell("B3"), {
      value: `Gerado em ${new Date().toLocaleString("pt-BR")} · dados públicos da Receita Federal · os números abaixo são fórmulas sobre a aba Empresas`,
      font: fonte({ size: 9, color: { argb: COR.tinta3 } }),
    });

    // indicadores (2 linhas de 4 cartões)
    const ativas = ok.filter((r) => u.classeSituacao(r.dados.situacao || "") === "ok").length;
    const naoEnc = feitos.length - nOk;
    const idadeMed = u.mediana(ok.map((r) => u.anosDeEmpresa(r.dados.abertura)));
    const capMed = u.mediana(ok.map((r) => r.dados.capital));
    const cartoes = [
      [["B"], "CONSULTADOS", { formula: `COUNTA(${E("CNPJ")})`, result: feitos.length }, "0", "CNPJs na planilha", null],
      [["C", "E"], "ATIVAS", { formula: `COUNTIF(${E("Situação cadastral")},"Ativa")`, result: ativas }, "0",
        { formula: `IF(B6=0,"",TEXT(C6/B6,"0%")&" do lote")`, result: feitos.length ? `${Math.round((ativas / feitos.length) * 100)}% do lote` : "" }, COR.ok],
      [["G"], "PEDEM ATENÇÃO", { formula: "B6-C6", result: feitos.length - ativas }, "0", "não ativas ou não encontradas", COR.warn],
      [["H", "J"], "NÃO ENCONTRADOS", { formula: `COUNTIF(${E("Status da consulta")},"<>OK")`, result: naoEnc }, "0", "CNPJ sem retorno na base pública", COR.neutro],
      [["B"], "TEMPO MEDIANO DE EMPRESA", { formula: `IFERROR(MEDIAN(${E("Anos de empresa")}),"—")`, result: idadeMed ?? "—" }, '0.0 "anos"', "desde a data de abertura", null],
      [["C", "E"], "CAPITAL SOCIAL MEDIANO", { formula: `IFERROR(MEDIAN(${E("Capital social")}),"—")`, result: capMed ?? "—" }, FMT_BRL0, "metade acima, metade abaixo", null],
      [["G"], "MATRIZES", { formula: `COUNTIF(${E("Matriz/Filial")},"Matriz")`, result: ok.filter((r) => /matriz/i.test(r.dados.tipo || "")).length }, "0", "as demais são filiais", null],
      [["H", "J"], "OPTANTES PELO SIMPLES", { formula: `COUNTIF(${E("Simples Nacional")},"Sim")`, result: ok.filter((r) => r.dados.simples === true).length }, "0", "inclui MEI", null],
    ];
    cartoes.forEach(([cols, rotulo, valor, fmt, det, cor], i) => {
      const base = i < 4 ? 5 : 9; // linhas 5-7 e 9-11
      const [ini, fim] = [cols[0], cols[1] || cols[0]];
      const faixa = (r) => `${ini}${r}:${fim}${r}`;
      [base, base + 1, base + 2].forEach((r) => { if (ini !== fim) ws.mergeCells(faixa(r)); });
      const c1 = ws.getCell(`${ini}${base}`), c2 = ws.getCell(`${ini}${base + 1}`), c3 = ws.getCell(`${ini}${base + 2}`);
      c1.value = rotulo; c1.font = fonte({ size: 8, bold: true, color: { argb: COR.tinta3 } });
      c2.value = valor; c2.numFmt = fmt; c2.font = fonte({ size: 20, bold: true });
      c3.value = det; c3.font = fonte({ size: 8, color: { argb: COR.tinta3 } });
      [c1, c2, c3].forEach((c) => { c.alignment = { horizontal: "left", vertical: "middle", indent: 1 }; });
      const colsNum = []; for (let k = ini.charCodeAt(0); k <= fim.charCodeAt(0); k++) colsNum.push(String.fromCharCode(k));
      for (const col of colsNum) for (const r of [base, base + 1, base + 2]) {
        const c = ws.getCell(`${col}${r}`);
        c.fill = fill(COR.branco);
        c.border = {
          top: r === base ? { style: cor ? "thick" : "thin", color: { argb: cor || COR.linha } } : undefined,
          bottom: r === base + 2 ? borda() : undefined,
          left: col === ini ? borda() : undefined, right: col === fim ? borda() : undefined,
        };
      }
      ws.getRow(base).height = 18; ws.getRow(base + 1).height = 30; ws.getRow(base + 2).height = 16;
    });
    // B6/C6 são referenciados acima: garante que os cartões 1 e 2 caíram nessas células
    // (Consultados = B6, Ativas = C6)

    // blocos de gráficos, em pares lado a lado
    const pares = [["situacao", "idade"], ["uf", "porte"], ["cidade", "cnae"]];
    let linha = 13;
    for (const par of pares) {
      let maior = 0;
      par.forEach((id, lado) => {
        const dim = u.DIMENSOES.find((d) => d.id === id);
        const altura = bloco(ws, dim, feitos, u, E, linha, lado === 0 ? ["B", "C", "D", "E"] : ["G", "H", "I", "J"]);
        maior = Math.max(maior, altura);
      });
      linha += maior + 1;
    }

    ws.mergeCells(`B${linha}:J${linha}`);
    Object.assign(ws.getCell(`B${linha}`), {
      value: "As barras são proporcionais à maior categoria de cada bloco. Categorias além das 7 maiores são somadas em \"Outras\".",
      font: fonte({ size: 8, italic: true, color: { argb: COR.tinta3 } }),
    });
    ws.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
    return ws;
  }

  /** Um bloco "gráfico": título, total e uma linha por categoria com CONT.SE, % e barra. Devolve a altura em linhas. */
  function bloco(ws, dim, feitos, u, E, topo, [cCat, cQtd, cPct, cBar]) {
    const col = COLUNA_DIM[dim.id];
    const ag = u.agregar(dim, feitos);
    const totalFormula = dim.id === "situacao" ? `COUNTA(${E("CNPJ")})` : `COUNTIF(${E("Status da consulta")},"OK")`;

    // título do bloco + total
    const t = ws.getCell(`${cCat}${topo}`);
    t.value = dim.titulo.toUpperCase(); t.font = fonte({ size: 9, bold: true, color: { argb: COR.tinta2 } });
    const tot = ws.getCell(`${cQtd}${topo}`);
    tot.value = { formula: totalFormula, result: ag.total }; tot.numFmt = '0 "empresas"';
    tot.font = fonte({ size: 8, color: { argb: COR.tinta3 } });
    ws.mergeCells(`${cQtd}${topo}:${cBar}${topo}`);
    tot.alignment = { horizontal: "right" };

    // cabeçalho das colunas
    const h = topo + 1;
    [[cCat, "Categoria"], [cQtd, "Empresas"], [cPct, "%"], [cBar, ""]].forEach(([c, v]) => {
      const cel = ws.getCell(`${c}${h}`);
      cel.value = v; cel.font = fonte({ size: 8, bold: true, color: { argb: COR.tinta3 } });
      cel.border = { bottom: borda() };
      cel.alignment = { horizontal: c === cCat || c === cBar ? "left" : "right" };
    });

    const ini = h + 1, fim = h + ag.itens.length;
    const maxRef = `MAX($${cQtd}$${ini}:$${cQtd}$${fim})`;
    const maxVal = Math.max(0, ...ag.itens.map((x) => x.n));
    const totRef = `$${cQtd}$${topo}`;
    ag.itens.forEach((it, k) => {
      const r = ini + k;
      const rotulo = it.rotulo === u.OUTRAS && it.qtd ? `${u.OUTRAS} (${it.qtd})` : it.rotulo;
      const qtdFormula = it.rotulo === u.OUTRAS
        ? `${totRef}-SUM(${cQtd}${ini}:${cQtd}${r - 1})`
        : `COUNTIF(${E(col)},${criterio(it.rotulo)})`;
      let [corTxt, corBg] = [COR.marca, null];
      if (dim.status) [corTxt, corBg] = corSituacao(it.rotulo, u.classeSituacao, u.NAO_ENCONTRADO);

      const cat = ws.getCell(`${cCat}${r}`);
      cat.value = rotulo; cat.font = fonte({ color: { argb: dim.status ? corTxt : COR.tinta }, bold: !!dim.status });
      if (corBg) cat.fill = fill(corBg);
      const qtd = ws.getCell(`${cQtd}${r}`);
      qtd.value = { formula: qtdFormula, result: it.n }; qtd.numFmt = "0"; qtd.font = fonte({ bold: true });
      const pct = ws.getCell(`${cPct}${r}`);
      pct.value = { formula: `IF(${totRef}=0,0,${cQtd}${r}/${totRef})`, result: ag.total ? it.n / ag.total : 0 };
      pct.numFmt = FMT_PCT; pct.font = fonte({ color: { argb: COR.tinta3 } });
      const bar = ws.getCell(`${cBar}${r}`);
      bar.value = { formula: `REPT("█",ROUND(IF(${maxRef}=0,0,${cQtd}${r}/${maxRef})*${BARRA_MAX},0))`, result: "█".repeat(Math.round(maxVal ? (it.n / maxVal) * BARRA_MAX : 0)) };
      bar.font = { name: FONTE, size: 9, color: { argb: dim.status ? corTxt : COR.marca } };
      for (const c of [cCat, cQtd, cPct, cBar]) {
        const cel = ws.getCell(`${c}${r}`);
        if (!(c === cCat && corBg)) cel.fill = fill(COR.branco);
        cel.border = { bottom: borda(COR.superficie2) };
        cel.alignment = { vertical: "middle", horizontal: c === cQtd || c === cPct ? "right" : "left", indent: c === cBar || c === cCat ? 1 : 0 };
      }
      ws.getRow(r).height = 17;
    });
    return 2 + ag.itens.length;
  }

  // ---------------------------------------------------------------- abas Sócios, CNAEs e Sobre
  function abaSimples(wb, nome, colunas, linhas, tab) {
    const ws = wb.addWorksheet(nome, { views: [{ state: "frozen", ySplit: 1 }], properties: { tabColor: { argb: tab } } });
    ws.columns = colunas.map(([header, width]) => ({ header, width }));
    cabecalho(ws, 1);
    linhas.forEach((l) => ws.addRow(l));
    corpo(ws, 2, linhas.length + 1, colunas.length);
    ws.getColumn(1).font = fonte({ name: "Consolas" });
    cabecalho(ws, 1);
    ws.autoFilter = { from: "A1", to: `${colunaLetra(colunas.length)}1` };
    return ws;
  }

  function abaSobre(wb, feitos) {
    const ws = wb.addWorksheet("Sobre", { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 2 }, { width: 28 }, { width: 90 }];
    const linhas = [
      ["Cadastro Aberto", ""],
      ["", ""],
      ["Gerado em", new Date().toLocaleString("pt-BR")],
      ["CNPJs na planilha", String(feitos.length)],
      ["Fonte dos dados", "Dados abertos do CNPJ publicados pela Receita Federal, via BrasilAPI e CNPJ.ws. Podem ter alguns dias de defasagem."],
      ["Não encontrado", "CNPJ com dígitos válidos que não retornou dados na base pública (pode ser recente, estar fora da base ou a consulta ter falhado)."],
      ["Pedem atenção", "Empresas com situação diferente de Ativa (baixada, inapta, suspensa, nula) mais as não encontradas."],
      ["Mediana", "Valor do meio da lista ordenada. Usada em vez da média para que uma empresa muito grande não distorça o resultado."],
      ["Dashboard", "Todos os números são fórmulas sobre a aba Empresas. Ao editar ou excluir linhas lá, o Dashboard se recalcula."],
      ["Aviso", "Planilha informativa. Não substitui o comprovante oficial de inscrição emitido pelo site da Receita Federal."],
      ["", ""],
      ["Projeto", "Cadastro Aberto · Renan Henrique Carneiro · rhcarneiro01-source.github.io/cadastro-aberto"],
    ];
    linhas.forEach(([a, b], i) => {
      const r = ws.getRow(i + 2);
      r.getCell(2).value = a; r.getCell(3).value = b;
      r.getCell(2).font = fonte({ bold: true, color: { argb: i === 0 ? COR.marca : COR.tinta2 }, size: i === 0 ? 16 : 10 });
      r.getCell(3).font = fonte();
      r.getCell(3).alignment = { wrapText: true, vertical: "top" };
      r.getCell(2).alignment = { vertical: "top" };
    });
  }

  // ---------------------------------------------------------------- montagem
  /**
   * @param ExcelJS  biblioteca carregada
   * @param resultados  lista do lote ({cnpj, dados, erro})
   * @param u  utilitários do app (mascarar, titulo, agregar, DIMENSOES...)
   * @returns Promise<Blob>
   */
  async function gerarPlanilhaLote(ExcelJS, resultados, u) {
    const feitos = resultados.filter((r) => r.dados || r.erro);
    const wb = new ExcelJS.Workbook();
    wb.creator = "Cadastro Aberto"; wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true;

    // a aba Empresas é criada primeiro (as fórmulas do Dashboard dependem das letras dela),
    // e o Dashboard é movido para a primeira posição logo depois
    const { ultima } = abaEmpresas(wb, feitos, u);
    abaDashboard(wb, feitos, u, ultima);

    const ok = feitos.filter((r) => r.dados);
    abaSimples(wb, "Sócios", [["CNPJ", 20], ["Razão social", 40], ["Sócio / administrador", 40], ["Qualificação", 30], ["Entrada", 12], ["Faixa etária", 22]],
      ok.flatMap((r) => r.dados.socios.map((s) => [u.mascarar(r.dados.cnpj), r.dados.razao, s.nome, s.qualificacao, s.entrada, s.faixa])), COR.tinta3);
    abaSimples(wb, "CNAEs", [["CNPJ", 20], ["Razão social", 40], ["Tipo", 12], ["Código", 12], ["Descrição", 70]],
      ok.flatMap((r) => [
        [u.mascarar(r.dados.cnpj), r.dados.razao, "Principal", r.dados.cnaePrincipal.codigo, r.dados.cnaePrincipal.descricao],
        ...r.dados.cnaesSec.map((c) => [u.mascarar(r.dados.cnpj), r.dados.razao, "Secundária", c.codigo, c.descricao]),
      ]), COR.tinta3);
    abaSobre(wb, feitos);

    // ordem das abas: Dashboard, Empresas, Sócios, CNAEs, Sobre
    const ordem = ["Dashboard", "Empresas", "Sócios", "CNAEs", "Sobre"];
    wb.worksheets.forEach((ws) => { ws.orderNo = ordem.indexOf(ws.name); });
    wb.views = [{ activeTab: 0, firstSheet: 0 }];

    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  window.CadastroPlanilha = { gerarPlanilhaLote, COLS };
})();
