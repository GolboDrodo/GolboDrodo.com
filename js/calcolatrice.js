var vop1, vop2, vris;


function inizializza_calcolatrice(){
    vop1=0;
    vop2=0;
    vris=0;
}

function somma ( op1, op2) {
var r;
r= op1 + op2;
return r;

}


function esegui_somma(){
    var o1=parseInt (document.getElementById("primo_valore").value);
    var o2=parseInt (document.getElementById("secondo_valore").value);
    var ris = somma(o1,o2);
    document.getElementById("risultato_valore").value = ris;
    document.getElementById("imgoperazione").src = "images2/somma.png"


}
function sottrazione ( op1, op2) {
    var r;
    r= op1 - op2;
    return r;
    
    }
    
    
    function esegui_sottrazione(){
        var o1=parseInt (document.getElementById("primo_valore").value);
        var o2=parseInt (document.getElementById("secondo_valore").value);
        var ris = sottrazione(o1,o2);
        document.getElementById("risultato_valore").value = ris;
        document.getElementById("imgoperazione").src = "images2/sottrazione.png"     
    }
    function moltiplicazione ( op1, op2) {
        var r;
        r= op1 * op2;
        return r;
        
        }
        
        
        function esegui_moltiplicazione(){
            var o1=parseInt (document.getElementById("primo_valore").value);
            var o2=parseInt (document.getElementById("secondo_valore").value);
            var ris = moltiplicazione(o1,o2);
            document.getElementById("risultato_valore").value = ris;
            document.getElementById("imgoperazione").src = "images2/moltiplicazione.png"
        
        }
        function divisione ( op1, op2) {
            var r;
            r= op1 / op2;
            return r;
            
            }
            
            
            function esegui_divisione(){
                var o1=parseInt (document.getElementById("primo_valore").value);
                var o2=parseInt (document.getElementById("secondo_valore").value);
                var ris = divisione(o1,o2);
                document.getElementById("risultato_valore").value = ris;
                document.getElementById("imgoperazione").src = "images2/divisione.png"
            
            }
            
function deforma() {
document.getElementById ("vecchio1").src="parc/vecchiodeforme.gif" ;

}
function potenzia() {
document.getElementById ("vecchio1").src="parc/potenza1.gif" ;
    }
 function ripristina() {
document.getElementById ("vecchio1").src="parc/vecchio1.png" ; 
}     
///////////////////////////////////////////////////////////////////////////////////////////////       
function deforma2() {
document.getElementById ("vecchio2").src="parc/vecchiodeforme2.gif";
}
function potenzia2() {
document.getElementById ("vecchio2").src="parc/potenzia2.png" ;  
    }
 function ripristina2() {
document.getElementById ("vecchio2").src="parc/vecchio2.png" ;
}
///////////////////////////////////////////////////////////////////////////////////////////////             
function deforma3() {
document.getElementById ("vecchio3").src="parc/deforma3.gif";
}
function potenzia3() {
document.getElementById ("vecchio3").src="parc/potenzia3.png" ;   
    }
 function ripristina3() {
document.getElementById ("vecchio3").src="parc/vecchio3.png" ;  
}
///////////////////////////////////////////////////////////////////////////////////////////////            
function deforma4() {
document.getElementById ("vecchio4").src="parc/deforma4.gif";
}
function potenzia4() {
document.getElementById ("vecchio4").src="parc/potenzia4.png" ;   
    }
 function ripristina4() {
document.getElementById ("vecchio4").src="parc/vecchio4.png" ;  
}

   /*
function antonietta() {
    document.getElementById ("vecchio1").src="parc/vecchio3.png"
   

    var btn = document.createElement('input');
    btn.setAttribute('type' , 'button');
    btn.setAttribute('value', 'FINISH GAME');
    document.body.appendChild(btn);
    btn.addEventListener('click','sf',false);
*/

function zitto() {
    document.getElementById ("baloon").src="picc/iogiffo.gif"
    document.getElementById ("frase").src="picc/frase_invisibile.png"
}




  
 
        
    
     
                        
            