/** Portuguese body of the user guide. Keep the section structure in sync with
 * HelpEn/HelpUa when editing. */
export function HelpPt({ isAdmin }: { isAdmin: boolean }) {
  return (
    <>
      <section className="card">
        <h3>O que é este site</h3>
        <p>
          Um placar ao vivo de um torneio de futebol local: fase de grupos seguida de
          eliminatórias. Tudo se atualiza em tempo real - resultados, classificações e o
          bracket mudam em todos os ecrãs no momento em que um administrador regista um
          golo. Nunca é preciso recarregar a página.
        </p>
        <p>
          As contas têm dois perfis: os <strong>espectadores</strong> veem tudo em modo de
          leitura; os <strong>administradores</strong> também registam resultados. Criar
          uma conta nova cria sempre um espectador.
        </p>
      </section>

      <section className="card">
        <h3>Como navegar</h3>
        <p>
          O cabeçalho é igual em todas as páginas; o título à esquerda volta sempre ao
          início. Num ecrã largo, as páginas do próprio torneio - Visão geral, Resultados,
          Eliminatórias e Equipas - ficam juntas sob um único menu identificado com a
          página em que está, por isso abre-o para passar entre elas.
          Torneios{isAdmin ? ', Ajuda e Admin' : ' e Ajuda'} continuam como ligações
          próprias.
        </p>
        <p>
          O teu nome à direita abre o menu da conta, que contém a troca de idioma
          (EN / UA / PT) e o botão para terminar sessão. Num ecrã estreito, todo o
          cabeçalho recolhe atrás do botão de menu - abre um painel que mostra tudo de uma
          vez, sem menus suspensos.
        </p>
      </section>

      <section className="card">
        <h3>Torneios</h3>
        <p>
          O site acolhe muitos torneios ao longo do tempo. A página «Torneios» lista-os
          todos: o que se joga agora, o que está previsto (com datas) e os anteriores. Um
          torneio terminado fica disponível como arquivo em modo de leitura - os
          resultados, as tabelas e o bracket ficam exatamente como acabaram.
        </p>
      </section>

      <section className="card">
        <h3>Visão geral</h3>
        <p>
          A página inicial mostra uma tabela por grupo. As tabelas são <em>ao vivo</em>:
          um jogo em curso conta com o resultado atual, por isso cada golo reordena a
          classificação de imediato (um 0:0 acabado de começar conta como empate
          provisório).
        </p>
        <ul>
          <li>
            As equipas ordenam-se por pontos, depois vitórias, diferença de golos e golos
            marcados; se tudo estiver igual, decide o confronto direto.
          </li>
          <li>
            Um marcador <span className="help__mark help__mark--green">verde</span>{' '}
            significa que a posição se apura automaticamente; um marcador{' '}
            <span className="help__mark help__mark--blue">azul</span> significa que essa
            posição é disputada entre grupos pelas vagas restantes.
          </li>
          <li>
            Quando uma posição é disputada, uma tabela extra (por exemplo, «Melhores 3ºs»)
            ordena as suas equipas entre todos os grupos; passam as primeiras linhas
            destacadas a verde.
          </li>
        </ul>
      </section>

      <section className="card">
        <h3>Resultados</h3>
        <p>
          Todos os jogos de grupo com hora, campo e resultado. Um selo vermelho marca os
          jogos ao vivo neste momento. Clique num jogo para abrir a sua página com um
          placar grande{isAdmin ? ' e, para administradores, os controlos de resultado' : ''}.
        </p>
      </section>

      <section className="card">
        <h3>Eliminatórias</h3>
        <p>
          O bracket comporta a maior potência de dois abaixo do número de equipas, por
          isso a fase de grupos elimina sempre alguém: 35 equipas dão um bracket de 32
          (3 ficam de fora) e 16 equipas exatas dão um bracket de 8. As posições
          apuram-se por ordem - todos os 1ºs, todos os 2ºs, e assim por diante - e as
          últimas vagas decidem-se entre as equipas de uma única posição de grupos
          diferentes.
        </p>
        <ul>
          <li>
            Os confrontos da primeira ronda mantêm separadas as equipas do mesmo grupo
            sempre que possível; um duelo do mesmo grupo só acontece quando um grupo
            fornece mais de metade do bracket.
          </li>
          <li>
            Enquanto os grupos ainda se jogam, os nomes entre parênteses - como
            «Cabeça 1 (FC Lions)» - são uma projeção ao vivo da classificação atual. Os
            parênteses desaparecem quando o confronto fica definitivo.
          </li>
          <li>
            O mesmo vale para as rondas seguintes: «Vencedor QF1 (FC Lions)» mostra quem
            está à frente num jogo por terminar; um jogo empatado não projeta nada.
          </li>
          <li>Um jogo eliminatório empatado decide-se nas grandes penalidades.</li>
          <li>Clique em qualquer cartão do bracket para abrir a página desse jogo.</li>
        </ul>
      </section>

      <section className="card">
        <h3>Equipas</h3>
        <p>
          Escolha uma equipa para ver o plantel: nomes, números e posições dos jogadores.
          O seletor agrupa as equipas pelo seu grupo - toque no título de um grupo para o
          abrir ou fechar; as equipas sem grupo aparecem em "Sem grupo".
        </p>
      </section>

      {isAdmin && (
        <>
          <section className="card">
            <h3>Administração: conduzir um jogo</h3>
            <ul>
              <li>
                Abra o jogo (nos Resultados ou num cartão do bracket) e use{' '}
                <strong>+ golo</strong> / <strong>-</strong> em cada lado. Marcar golo num
                jogo agendado inicia-o automaticamente; <strong>Iniciar</strong> faz o
                mesmo sem golo.
              </li>
              <li>
                <strong>Final</strong> termina o jogo. Um jogo eliminatório empatado não
                termina enquanto não houver um resultado decisivo de penáltis - os botões
                de penáltis aparecem sempre que o resultado está empatado.
              </li>
              <li>
                <strong>Repor</strong> congela o jogo de volta a agendado e MANTÉM o
                resultado, que continua editável; só uma reposição a 0:0 limpa também os
                penáltis. Os espectadores continuam a ver o resultado congelado.
              </li>
              <li>
                Num jogo eliminatório, os dois seletores permitem fixar manualmente
                qualquer equipa num dos lados (walkover, desqualificação); «Auto» devolve
                o participante automático. <strong>Repor eliminatórias</strong> na página
                do bracket limpa todos os resultados eliminatórios de uma vez.
              </li>
            </ul>
          </section>

          <section className="card">
            <h3>Administração: montar o torneio</h3>
            <ul>
              <li>
                <strong>Admin - Torneios</strong>: crie torneios com antecedência (nome,
                datas previstas, estado). O estado «terminado» transforma o torneio num
                arquivo - qualquer alteração dentro dele é rejeitada até voltar a pô-lo «a
                decorrer». Só um torneio vazio (sem grupos, equipas ou jogos) pode ser
                eliminado, e nunca o último; eliminar um torneio também limpa
                automaticamente qualquer resto de eliminatórias, sem precisar de as repor
                à parte.
              </li>
              <li>
                <strong>Exportar</strong> descarrega uma cópia JSON completa de um
                torneio - grupos, equipas, plantéis, jogos e o bracket. Guarde-a como
                cópia fora do site ou use-a para mover um torneio para outro servidor.
              </li>
              <li>
                <strong>Relatório PDF</strong> (o ícone de folha ao lado de Exportar)
                descarrega um retrato imprimível dos resultados do torneio -
                classificações e jogos dos grupos, depois os resultados das
                eliminatórias. Funciona para qualquer torneio da lista, seja qual for o
                estado.
              </li>
              <li>
                <strong>Importar</strong> restaura um torneio a partir desse ficheiro de
                cópia: escolha o ficheiro junto à lista de torneios. Cria sempre um
                torneio totalmente novo com identidade própria - importar o mesmo
                ficheiro duas vezes dá dois torneios separados, e o original de onde veio
                o ficheiro nunca é alterado. Se o nome coincidir com um já existente na
                lista, é acrescentado «(2)», «(3)» e assim por diante para os distinguir
                facilmente. O estado gravado no ficheiro decide como chega: «terminado»
                chega como arquivo em modo de leitura, «previsto» chega pronto a
                preparar, «a decorrer» torna-se o torneio que os visitantes veem por
                omissão. Um ficheiro danificado ou inválido é rejeitado antes de se criar
                seja o que for.
              </li>
              <li>
                O seletor de torneio aparece por cima de Jogos e Plantéis - as únicas
                páginas de administração que trabalham sobre um torneio - e define que
                torneio elas editam, para que um torneio previsto possa ser totalmente
                preparado antes de começar. A seleção vive no endereço da página:
                recarregar não a perde, e a ligação pode ser partilhada para abrir a
                administração já nesse torneio.
              </li>
              <li>
                <strong>Admin - Jogos</strong>: crie grupos e equipas; uma equipa pode
                entrar num grupo ao ser criada ou mais tarde, mas apenas enquanto não tem
                jogos. Um grupo tem no máximo cinco equipas (e precisa de pelo menos duas
                para se jogar); quando está cheio, deixa de aparecer na lista de escolha de
                grupo ao adicionar ou mover uma equipa. O botão «Jogos (n)» gera os jogos em
                falta (todos contra todos) com
                horas provisórias - as horas e o campo editam-se na própria tabela.
              </li>
              <li>
                Assim que existe um resultado eliminatório ou uma fixação manual, os
                grupos, as equipas e os jogos de grupo ficam bloqueados; «Repor
                eliminatórias» desbloqueia-os.
              </li>
              <li>
                <strong>Admin - Plantéis</strong>: listas de jogadores por equipa (nome,
                número opcional - único dentro da equipa - e posição).
              </li>
              <li>
                <strong>Admin - Utilizadores</strong>: promover/despromover, desativar ou
                eliminar contas. Desativar corta de imediato a ligação ao vivo do
                utilizador.
              </li>
              <li>
                <strong>Admin - Auditoria</strong>: um registo só de leitura das
                alterações de administração - quem alterou o quê e quando, do mais
                recente para o mais antigo (as entradas mais recentes). Uma
                importação deixa aí uma única entrada de resumo com o que chegou.
              </li>
              <li>
                Os botões de ação nas tabelas de administração são ícones - passe o
                rato por cima para ver o que cada um faz.
              </li>
              <li>As mensagens de erro aparecem sempre na secção a que dizem respeito.</li>
            </ul>
          </section>
        </>
      )}
    </>
  );
}
