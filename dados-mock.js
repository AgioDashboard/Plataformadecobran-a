// DADOS FICTICIOS. Nenhum nome, telefone ou valor aqui corresponde a pessoa
// real. Este arquivo vai para o GitHub Pages, que e publico — nunca colocar
// dado real de cliente aqui.
//
// Fase 2: substituir por um modulo com as mesmas exportacoes, alimentado
// pelo backend que consulta o Cobmais.

export const clientes = [
  { id: 'c-001', nome: 'Aurora Comercio de Tecidos', telefone: '5511900000001', valorCentavos: 128790, vencimento: '2026-06-18', status: 'sem-resposta' },
  { id: 'c-002', nome: 'Benedito Ferreira Nunes', telefone: '5511900000002', valorCentavos: 45900, vencimento: '2026-07-02', status: 'mensagem-enviada' },
  { id: 'c-003', nome: 'Cristal Servicos Digitais', telefone: '5521900000003', valorCentavos: 987650, vencimento: '2026-07-25', status: 'aguardando' },
  { id: 'c-004', nome: 'Dalva Monteiro Rocha', telefone: '5531900000004', valorCentavos: 21050, vencimento: '2026-08-05', status: 'mensagem-enviada' },
  { id: 'c-005', nome: 'Estrela Norte Transportes', telefone: '5511900000005', valorCentavos: 350000, vencimento: '2026-08-14', status: 'aguardando' },
  { id: 'c-006', nome: 'Fabio Andrade Peixoto', telefone: '5541900000006', valorCentavos: 7830, vencimento: '2026-08-15', status: 'aguardando' },
  { id: 'c-007', nome: 'Girassol Alimentos ME', telefone: '5511900000007', valorCentavos: 162400, vencimento: '2026-08-28', status: 'aguardando' },
];

export const historico = [
  { id: 'h-001', clienteId: 'c-004', quando: '2026-08-15T09:12:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Ola, Dalva. Identificamos uma pendencia em aberto…' },
  { id: 'h-002', clienteId: 'c-002', quando: '2026-08-15T09:10:00-03:00', canal: 'whatsapp', resultado: 'falhou', trecho: 'Numero sem WhatsApp ativo.' },
  { id: 'h-003', clienteId: 'c-001', quando: '2026-08-14T16:40:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Ola. Consta um valor vencido em 18/06…' },
  { id: 'h-004', clienteId: 'c-002', quando: '2026-08-13T11:05:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Bom dia, Benedito. Segue o lembrete…' },
  { id: 'h-005', clienteId: 'c-001', quando: '2026-08-11T10:00:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Primeiro contato sobre a pendencia…' },
];
