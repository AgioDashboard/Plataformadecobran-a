// DADOS FICTICIOS. Nenhum nome, telefone ou valor aqui corresponde a pessoa
// real. Este arquivo vai para o GitHub Pages, que e publico — nunca colocar
// dado real de cliente aqui.
//
// Fase 2: substituir por um modulo com as mesmas exportacoes, alimentado
// pelo backend que consulta o Cobmais.

export const clientes = [
  { id: 'c-001', nome: 'Aurora Comercio de Tecidos', telefone: '5511900000001', valorCentavos: 128790, vencimento: '2026-05-12', status: 'sem-resposta' },
  { id: 'c-002', nome: 'Benedito Ferreira Nunes', telefone: '5511900000002', valorCentavos: 45900, vencimento: '2026-05-28', status: 'mensagem-enviada' },
  { id: 'c-003', nome: 'Cristal Serviços Digitais', telefone: '5521900000003', valorCentavos: 987650, vencimento: '2026-06-03', status: 'sem-resposta' },
  { id: 'c-004', nome: 'Dalva Monteiro Rocha', telefone: '5531900000004', valorCentavos: 21050, vencimento: '2026-06-11', status: 'mensagem-enviada' },
  { id: 'c-005', nome: 'Estrela Norte Transportes', telefone: '5511900000005', valorCentavos: 350000, vencimento: '2026-06-18', status: 'sem-resposta' },
  { id: 'c-006', nome: 'Fabio Andrade Peixoto', telefone: '5541900000006', valorCentavos: 7830, vencimento: '2026-06-25', status: 'aguardando' },
  { id: 'c-007', nome: 'Girassol Alimentos ME', telefone: '5511900000007', valorCentavos: 162400, vencimento: '2026-07-02', status: 'mensagem-enviada' },
  { id: 'c-008', nome: 'Horizonte Papelaria Ltda', telefone: '5511900000008', valorCentavos: 58900, vencimento: '2026-07-06', status: 'aguardando' },
  { id: 'c-009', nome: 'Iracema Souza Prado', telefone: '5571900000009', valorCentavos: 243310, vencimento: '2026-07-09', status: 'sem-resposta' },
  { id: 'c-010', nome: 'Jacaranda Moveis Planejados', telefone: '5511900000010', valorCentavos: 1425000, vencimento: '2026-07-14', status: 'mensagem-enviada' },
  { id: 'c-011', nome: 'Kleber Santiago Muniz', telefone: '5551900000011', valorCentavos: 13270, vencimento: '2026-07-17', status: 'aguardando' },
  { id: 'c-012', nome: 'Lumiar Consultoria Contabil', telefone: '5511900000012', valorCentavos: 476500, vencimento: '2026-07-21', status: 'mensagem-enviada' },
  { id: 'c-013', nome: 'Marina Bittencourt Reis', telefone: '5521900000013', valorCentavos: 89900, vencimento: '2026-07-24', status: 'aguardando' },
  { id: 'c-014', nome: 'Nautica Pescados Distribuidora', telefone: '5548900000014', valorCentavos: 703200, vencimento: '2026-07-28', status: 'sem-resposta' },
  { id: 'c-015', nome: 'Otavio Camargo Lisboa', telefone: '5511900000015', valorCentavos: 32600, vencimento: '2026-07-31', status: 'aguardando' },
  { id: 'c-016', nome: 'Primavera Floricultura', telefone: '5531900000016', valorCentavos: 15840, vencimento: '2026-08-03', status: 'mensagem-enviada' },
  { id: 'c-017', nome: 'Quartzo Engenharia SA', telefone: '5511900000017', valorCentavos: 2180000, vencimento: '2026-08-05', status: 'sem-resposta' },
  { id: 'c-018', nome: 'Renata Villaça Amorim', telefone: '5541900000018', valorCentavos: 67450, vencimento: '2026-08-08', status: 'aguardando' },
  { id: 'c-019', nome: 'Solaris Energia Solar', telefone: '5511900000019', valorCentavos: 894300, vencimento: '2026-08-10', status: 'mensagem-enviada' },
  { id: 'c-020', nome: 'Tulipa Confeitaria Artesanal', telefone: '5511900000020', valorCentavos: 24900, vencimento: '2026-08-12', status: 'aguardando' },
  { id: 'c-021', nome: 'Ubiratan Melo Cavalcanti', telefone: '5581900000021', valorCentavos: 41200, vencimento: '2026-08-14', status: 'aguardando' },
  { id: 'c-022', nome: 'Verdejar Paisagismo', telefone: '5511900000022', valorCentavos: 137600, vencimento: '2026-08-15', status: 'aguardando' },
  { id: 'c-023', nome: 'Wanderley Pinto Gomes', telefone: '5562900000023', valorCentavos: 9990, vencimento: '2026-08-19', status: 'aguardando' },
  { id: 'c-024', nome: 'Xingu Logistica Integrada', telefone: '5511900000024', valorCentavos: 528700, vencimento: '2026-08-24', status: 'aguardando' },
  { id: 'c-025', nome: 'Zenite Clinica Odontologica', telefone: '5511900000025', valorCentavos: 316450, vencimento: '2026-09-02', status: 'aguardando' },
];

export const historico = [
  { id: 'h-001', clienteId: 'c-022', quando: '2026-08-15T09:12:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Ola. Identificamos uma pendencia em aberto vencida hoje…' },
  { id: 'h-002', clienteId: 'c-019', quando: '2026-08-15T09:10:00-03:00', canal: 'whatsapp', resultado: 'falhou', trecho: 'Numero sem WhatsApp ativo.' },
  { id: 'h-003', clienteId: 'c-016', quando: '2026-08-14T16:40:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Consta um valor vencido em 03/08…' },
  { id: 'h-004', clienteId: 'c-012', quando: '2026-08-14T11:22:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Bom dia. Segue o lembrete do boleto em aberto…' },
  { id: 'h-005', clienteId: 'c-010', quando: '2026-08-13T15:05:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Sobre a parcela vencida em 14/07…' },
  { id: 'h-006', clienteId: 'c-007', quando: '2026-08-13T10:31:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Lembrete amigavel sobre a pendencia…' },
  { id: 'h-007', clienteId: 'c-003', quando: '2026-08-12T14:18:00-03:00', canal: 'whatsapp', resultado: 'falhou', trecho: 'Mensagem nao entregue apos tres tentativas.' },
  { id: 'h-008', clienteId: 'c-002', quando: '2026-08-12T09:47:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Terceiro contato sobre o valor de maio…' },
  { id: 'h-009', clienteId: 'c-001', quando: '2026-08-11T16:02:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Retomando o contato sobre a pendencia de 12/05…' },
  { id: 'h-010', clienteId: 'c-014', quando: '2026-08-11T08:55:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Primeiro contato sobre o vencimento de 28/07…' },
  { id: 'h-011', clienteId: 'c-009', quando: '2026-08-10T13:40:00-03:00', canal: 'whatsapp', resultado: 'enviada', trecho: 'Segundo aviso referente ao valor em aberto…' },
  { id: 'h-012', clienteId: 'c-005', quando: '2026-08-10T09:15:00-03:00', canal: 'whatsapp', resultado: 'falhou', trecho: 'Numero invalido no cadastro.' },
];
