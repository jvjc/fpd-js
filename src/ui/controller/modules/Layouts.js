import '/src/ui/view/modules/Layouts';
import Modal from '/src/ui/view/comps/Modal';

import { getJSON } from '/src/helpers/request';
import { 
    addEvents,
    createImgThumbnail
} from '/src/helpers/utils';
    
export default class LayoutsModule extends EventTarget {

    #layoutElementLoadingIndex = 0;
	#totalLayoutElements = 0;
    #toggleLoader = false;
        
    constructor(fpdInstance, wrapper) {
        
        super();
        
        this.fpdInstance = fpdInstance;
        
        this.container = document.createElement("fpd-module-layouts");
        wrapper.append(this.container);

        this.gridElem = this.container.querySelector('.fpd-grid');

        addEvents(
            fpdInstance,
            'productCreate',
            (evt) => {

                const layoutsOption = fpdInstance.currentViews[0].options.layouts;

                if(typeof layoutsOption == 'string') {

                    getJSON({
                        url: this.fpdInstance.mainOptions.layouts,
                        onSuccess: (data) => {
        
                            this.layoutsData = data;
                            this.#setup();
        
                        },
                        onError: () => {
                            alert('Layouts JSON could not be loaded. Please check that your URL is correct! URL: '+this.fpdInstance.mainOptions.layouts);
                        } 
                    });  
        
                }
                else if(Array.isArray(layoutsOption)) {
                    this.layoutsData = layoutsOption;
                }

            }
        )

        addEvents(
            this.fpdInstance,
            'beforeElementAdd',
            this.#loadingLayoutElement.bind(this)
        )

    }

    #loadingLayoutElement(evt) {

        const element = evt.detail.element;
        
        if(this.#toggleLoader) {

            this.#layoutElementLoadingIndex++;
            
            const loadElementState = element.title + '<br>' + String(this.#layoutElementLoadingIndex) + '/' + this.#totalLayoutElements;
            this.fpdInstance.mainLoader.querySelector('.fpd-loader-text').innerHTML = loadElementState;

        }

	};

    #setup() {

        this.gridElem.innerHTML = '';

        if(Array.isArray(this.layoutsData)) {

            this.layoutsData.forEach(layoutObj => {
                
                const layoutItem = createImgThumbnail({
                    url: layoutObj.thumbnail,
                    title: layoutObj.title,
                    disablePrice: true,
                    disableDraggable: true
                });

                addEvents(
                    layoutItem,
                    'click',
                    (evt => {

                        if(!this.fpdInstance.productCreated) return;

                        var confirmModal = Modal(
                            this.fpdInstance.translator.getTranslation(
                                'modules', 
                                'layouts_confirm_replacement'
                            ), 
                            false, 
                            'confirm', 
                            this.fpdInstance.container
                        );
                        
                        const confirmBtn = confirmModal.querySelector('.fpd-confirm');
                        confirmBtn.innerText = this.fpdInstance.translator.getTranslation(
                            'modules', 
                            'layouts_confirm_button'
                        );
                        
                        addEvents(
                            confirmBtn,
                            'click',
                            () => {

                                this.#layoutElementLoadingIndex = 0;
                                this.#totalLayoutElements = layoutObj.elements.length;

                                this.fpdInstance.globalCustomElements = [];
                                if(this.fpdInstance.mainOptions.replaceInitialElements) {
                                    this.fpdInstance.globalCustomElements = this.fpdInstance.getCustomElements();
                                }

                                this.fpdInstance.toggleSpinner(true);
                                this.#toggleLoader = true;

                                this.fpdInstance.currentViewInstance.loadElements(layoutObj.elements, () => {

                                    this.#toggleLoader = false;
                                    this.fpdInstance.toggleSpinner(false);
                                    
                                    /**
                                     * Gets fired when a all elements of layout are added.
                                     *
                                     * @event FancyProductDesigner#layoutElementsAdded
                                     * @param {Event} event
                                     * @param {Array} elements - Added elements.
                                     */
                                    this.fpdInstance.dispatchEvent(
                                        new CustomEvent('layoutElementsAdded', {
                                            detail: {
                                                elements: layoutObj.elements
                                            }
                                        })
                                    );

                                });
                                
                                confirmModal.remove();
                                
                            }
                        )
                        
                        
                    })
                )

                this.gridElem.append(layoutItem);
                this.fpdInstance.lazyBackgroundObserver.observe(layoutItem.querySelector('picture'));
                

            })

        }
        

    }

}
    